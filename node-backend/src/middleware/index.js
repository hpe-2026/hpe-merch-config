import jwt from 'jsonwebtoken';
import authService from '../services/authService.js';
import keycloakConfig from '../config/keycloak.js';
import logger from '../config/logger.js';
import { setKeycloakSubjectInBaggage } from '../tracing.js';
import otelApi from '@opentelemetry/api';

const { trace, context, baggage } = otelApi;

/**
 * Attach Keycloak identity to the active trace span and baggage.
 * This enables persistent identity correlation across logs and traces.
 */
function attachPersistentIdentity(req, userId, email, roles) {
  try {
    const activeCtx = context.active();
    const currentSpan = trace.getSpan(activeCtx);

    if (currentSpan && currentSpan.setAttribute) {
      currentSpan.setAttribute('keycloak.subject_id', userId || 'anonymous');
      currentSpan.setAttribute('keycloak.user_email', email || 'anonymous');
      currentSpan.setAttribute('keycloak.user_roles', JSON.stringify(roles || []));
    }

    // Also set baggage so identity propagates to downstream services
    setKeycloakSubjectInBaggage(userId, email, roles);
  } catch (err) {
    logger.debug('Failed to attach persistent identity:', err.message);
  }
}

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided',
      });
    }

    const token = authHeader.substring(7);

    // Accept demo admin tokens for testing (format: admin-token-*)
    if (token.startsWith('admin-token-')) {
      req.user = {
        id: 'admin-user',
        email: 'admin@nitte.com',
        roles: ['admin'],
        role: 'admin',
        userId: 'admin-user'
      };
      attachPersistentIdentity(req, req.user.userId, req.user.email, req.user.roles);
      next();
      return;
    }

    // Try simple JWT verification first (MongoDB-based auth)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key-change-in-production');
      req.user = {
        ...decoded,
        roles: decoded.roles || (decoded.role ? [decoded.role] : ['user']),
        userId: decoded.user_id || decoded.id || decoded.sub,
      };
      attachPersistentIdentity(req, req.user.userId, req.user.email, req.user.roles);
      next();
      return;
    } catch (jwtErr) {
      // Not a simple JWT, try Keycloak
    }

    // Try Keycloak token verification (RS256 signature checked against JWKS)
    try {
      const decodedToken = await keycloakConfig.verifyAccessToken(token);
      const userInfo = keycloakConfig.extractUserInfo(decodedToken);
      req.user = {
        userId: userInfo.userId,
        email: userInfo.email,
        name: userInfo.name,
        // Backward compatible
        roles: userInfo.roles,
        role: userInfo.roles?.[0] || 'user',
        // New role structure (Phase 1 RBAC)
        realmRoles: userInfo.realmRoles || [],
        clientRoles: userInfo.clientRoles || {},
        allClientRoles: userInfo.allClientRoles || [],
        // Custom attributes
        merchantId: userInfo.merchantId || null,
        groups: userInfo.groups || [],
        // Token info
        token: token,
        email_verified: userInfo.email_verified,
      };
      attachPersistentIdentity(req, req.user.userId, req.user.email, req.user.roles);
      next();
      return;
    } catch (kcErr) {
      logger.warn('Keycloak token verification failed:', kcErr.message);
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  } catch (error) {
    logger.error('Authentication middleware error', { error: error.message });
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

export const adminMiddleware = (req, res, next) => {
  const isAdmin = req.user && (
    req.user.role === 'admin' ||
    (req.user.roles && req.user.roles.includes('admin'))
  );
  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }
  next();
};

export const requireRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const userRoles = req.user.roles || [req.user.role] || [];
    const hasRole = roles.some(role => userRoles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ success: false, message: `Required role(s): ${roles.join(', ')}` });
    }
    next();
  };
};

export const alumniMiddleware = requireRoles('alumni', 'admin', 'admin-internal');
export const merchantMiddleware = requireRoles('merchant', 'merchant-amazon', 'merchant-flipkart', 'admin', 'admin-internal');

/**
 * Internal Admin Middleware - requires admin-internal role (full DevOps access: Jenkins, Nexus, Keycloak Admin)
 */
export const internalAdminMiddleware = (req, res, next) => {
  const isInternalAdmin = req.user && (
    req.user.role === 'admin-internal' ||
    (req.user.roles && req.user.roles.includes('admin-internal'))
  );
  if (!isInternalAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Internal Admin access required (Jenkins/Nexus/Keycloak Admin)',
      code: 'INTERNAL_ADMIN_REQUIRED'
    });
  }
  next();
};

/**
 * Internal User Middleware - requires internal-user role (limited DevOps: Jenkins viewer, observability read-only)
 */
export const internalUserMiddleware = (req, res, next) => {
  const isInternalUser = req.user && (
    req.user.role === 'internal-user' ||
    (req.user.roles && req.user.roles.includes('internal-user'))
  );
  if (!isInternalUser) {
    return res.status(403).json({
      success: false,
      message: 'Internal User access required (observability dashboards)',
      code: 'INTERNAL_USER_REQUIRED'
    });
  }
  next();
};

/**
 * Nexus Admin Middleware - requires nexus-admin or admin-internal role
 */
export const nexusAdminMiddleware = (req, res, next) => {
  const hasNexusAdmin = req.user && (
    req.user.roles?.includes('nexus-admin') ||
    req.user.roles?.includes('admin-internal')
  );
  if (!hasNexusAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Nexus Admin access required to create repositories',
      code: 'NEXUS_ADMIN_REQUIRED'
    });
  }
  next();
};

/**
 * Third-party Merchant Middleware - requires merchant-amazon or merchant-flipkart role
 */
export const thirdPartyMerchantMiddleware = (req, res, next) => {
  const isThirdPartyMerchant = req.user && (
    req.user.roles?.includes('merchant-amazon') ||
    req.user.roles?.includes('merchant-flipkart') ||
    req.user.roles?.includes('admin-internal')
  );
  if (!isThirdPartyMerchant) {
    return res.status(403).json({
      success: false,
      message: 'Third-party merchant access required (Amazon/Flipkart)',
      code: 'THIRD_PARTY_MERCHANT_REQUIRED'
    });
  }
  next();
};

export const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Generate/request correlation ID for distributed tracing
  req.correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || generateCorrelationId();
  res.setHeader('X-Correlation-Id', req.correlationId);

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // Extract Keycloak Subject ID (immutable identity) for correlation
    const keycloakSubjectId = req.user?.userId || req.user?.sub || req.user?.id || null;
    const userEmail = req.user?.email || null;
    const userRoles = req.user?.roles || [];

    // Build structured log entry with identity correlation
    const logEntry = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      correlationId: req.correlationId,
      keycloakSubjectId,
      userEmail,
      userRoles,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    };

    // Log with appropriate level based on status code
    if (res.statusCode >= 500) {
      logger.error('Request completed with server error', logEntry);
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed with client error', logEntry);
    } else {
      logger.info('Request completed', logEntry);
    }
  });

  next();
};

function generateCorrelationId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Export ownership middleware (Phase 2: Resource-Level Authorization)
export {
  requireOwnership,
  requireProductOwnership,
  requireOrderOwnership,
  filterByOwnership,
  requirePermissionAndOwnership,
  setOwnershipOnCreate,
} from './ownership.js';

// Export gateway middleware (Phase 3: API Gateway Pattern)
export {
  addGatewayHeaders,
  requireGatewayHeaders,
  createServiceHeaders,
  logGatewayPropagation,
} from './gateway.js';

// Export ABAC middleware (Phase 4: Attribute-Based Access Control)
export {
  hasGroup,
  getAttribute,
  getNumericAttribute,
  getBooleanAttribute,
  canAccessEarlySale,
  canGetDiscount,
  canAccessMerchantFeatures,
  canAccessChapterEvents,
  requireABAC,
  requireEarlySaleAccess,
  requireAlumniDiscount,
  requireMerchantAccess,
  attachUserAttributes,
} from './abac.js';

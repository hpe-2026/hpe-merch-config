/**
 * NITTE Policy Middleware
 * 
 * Express middleware for enforcing RBAC policies.
 * Can be applied to routes to require specific actions.
 */

import logger from '../config/logger.js';

/**
 * Create policy enforcement middleware
 * @param {PolicyEngine} policyEngine - Policy engine instance
 * @returns {function} - Middleware function
 */
export const createPolicyMiddleware = (policyEngine) => {
  /**
   * Middleware to check policy for a specific action
   * @param {string|string[]} requiredActions - Action(s) required for this endpoint
   * @param {function} getContext - Optional function to extract context from request
   * @returns {function} - Express middleware
   */
  return (requiredActions, getContext = null) => {
    const actions = Array.isArray(requiredActions) ? requiredActions : [requiredActions];

    return async (req, res, next) => {
      try {
        // Build context from request
        const baseContext = {
          userId: req.user?.id,
          role: req.user?.role || 'guest',
          method: req.method,
          path: req.path,
          ip: req.ip,
        };

        // Merge with custom context if provided
        const context = getContext ? { ...baseContext, ...getContext(req) } : baseContext;

        // Check if any of the required actions is allowed
        let allowed = false;

        for (const action of actions) {
          const isAllowed = await policyEngine.evaluate(action, context);
          if (isAllowed) {
            allowed = true;
            logger.debug(`Policy allowed for action: ${action}, user: ${context.userId || 'guest'}`);
            break;
          }
        }

        if (!allowed) {
          logger.warn(
            `Policy denied - Action(s): ${actions.join(', ')}, Role: ${context.role}, User: ${context.userId || 'guest'}`
          );

          return res.status(403).json({
            success: false,
            message: 'Access denied - insufficient permissions',
            code: 'POLICY_DENIED',
            requiredActions: actions,
            userRole: context.role,
            timestamp: new Date(),
          });
        }

        // Attach evaluated actions to request for logging
        req.policy = {
          evaluatedActions: actions,
          context,
          allowed: true,
        };

        next();
      } catch (error) {
        logger.error(`Policy middleware error: ${error.message}`);
        res.status(500).json({
          success: false,
          message: 'Policy evaluation error',
          code: 'POLICY_ERROR',
        });
      }
    };
  };
};

/**
 * Middleware to require a specific role
 * @param {string|string[]} requiredRoles - Role(s) required
 * @returns {function} - Express middleware
 */
export const requireRole = (requiredRoles) => {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(`Role check failed - Required: ${roles.join(', ')}, Got: ${req.user.role}`);

      return res.status(403).json({
        success: false,
        message: `Insufficient permissions - requires role: ${roles.join(' or ')}`,
        code: 'INSUFFICIENT_ROLE',
        requiredRoles: roles,
        userRole: req.user.role,
      });
    }

    next();
  };
};

/**
 * Middleware to require authentication (any logged-in user)
 * @returns {function} - Express middleware
 */
export const requireAuth = () => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
      });
    }

    next();
  };
};

/**
 * Middleware to require admin role specifically
 * @returns {function} - Express middleware
 */
export const requireAdmin = () => {
  return requireRole('admin');
};

/**
 * Optional RBAC check - logs but doesn't block
 * @param {PolicyEngine} policyEngine - Policy engine instance
 * @returns {function} - Middleware function
 */
export const auditPolicy = (policyEngine) => {
  return (action) => {
    return async (req, res, next) => {
      try {
        const context = {
          userId: req.user?.id,
          role: req.user?.role || 'guest',
          action,
          path: req.path,
          method: req.method,
        };

        const allowed = await policyEngine.evaluate(action, context);

        // Log for audit trail but don't block
        logger.info(`AUDIT[${allowed ? 'ALLOW' : 'DENY'}] Action: ${action}, Role: ${context.role}, User: ${context.userId || 'guest'}`);

        // Attach audit info to request
        req.audit = {
          action,
          allowed,
          ...context,
        };

        next();
      } catch (error) {
        logger.error(`Audit middleware error: ${error.message}`);
        next(); // Don't block on error
      }
    };
  };
};

/**
 * Context extractor for product resources
 * @param {array} products - Product collection
 * @returns {function} - Function to extract context from request
 */
export const productContext = (products) => {
  return (req) => {
    const resource = {
      type: 'product',
      id: req.params.id || req.body.id,
    };

    // Find product in request params/body
    if (req.body.product) {
      resource.status = req.body.product.status;
    } else if (req.params.id) {
      // In real implementation, look up from database
      resource.status = 'active'; // Default
    }

    return { resource };
  };
};

/**
 * Context extractor for order resources
 * @returns {function} - Function to extract context from request
 */
export const orderContext = () => {
  return (req) => {
    const resource = {
      type: 'order',
      id: req.params.id,
      userId: req.body.userId || req.user?.id,
    };

    return { resource };
  };
};

export default createPolicyMiddleware;

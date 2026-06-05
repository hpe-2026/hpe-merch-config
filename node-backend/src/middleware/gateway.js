/**
 * Phase 3: API Gateway Pattern
 * 
 * Adds gateway headers to downstream services for service-to-service auth.
 * Downstream services can trust these headers from the gateway.
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';

/**
 * Middleware to add gateway headers for downstream services
 * 
 * Adds headers:
 * - X-User-ID: user-uuid
 * - X-User-Email: user@example.com
 * - X-Roles: realm:alumni-verified,client:order:create
 * - X-Merchant-ID: merchant-uuid (if applicable)
 * - X-Request-ID: uuid for tracing
 * - X-Correlation-ID: existing or new correlation id
 */
export const addGatewayHeaders = (req, res, next) => {
  if (!req.user) {
    // Allow anonymous requests (public endpoints)
    req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
    req.headers['x-correlation-id'] = req.headers['x-correlation-id'] || uuidv4();
    return next();
  }

  // Generate request ID for this request
  const requestId = uuidv4();
  
  // Build roles string
  const realmRoles = (req.user.realmRoles || req.user.roles || [])
    .map(r => `realm:${r}`);
  const clientRoles = (req.user.allClientRoles || [])
    .map(r => `client:${r}`);
  const allRoles = [...realmRoles, ...clientRoles].join(',');

  // Add gateway headers
  req.headers['x-user-id'] = req.user.userId;
  req.headers['x-user-email'] = req.user.email;
  req.headers['x-roles'] = allRoles;
  req.headers['x-request-id'] = requestId;
  req.headers['x-correlation-id'] = req.correlationId || uuidv4();
  
  if (req.user.merchantId) {
    req.headers['x-merchant-id'] = req.user.merchantId;
  }

  // Also set on response for client visibility
  res.setHeader('X-Request-ID', requestId);

  logger.debug('Gateway headers added', {
    userId: req.user.userId,
    requestId,
    merchantId: req.user.merchantId,
  });

  next();
};

/**
 * Middleware to validate that a request came through the gateway
 * (for internal services to reject direct calls)
 */
export const requireGatewayHeaders = (req, res, next) => {
  // In development, allow direct calls
  if (process.env.NODE_ENV === 'development' && process.env.ALLOW_DIRECT_CALLS === 'true') {
    return next();
  }

  const userId = req.headers['x-user-id'];
  const roles = req.headers['x-roles'];
  const requestId = req.headers['x-request-id'];

  if (!userId || !roles || !requestId) {
    logger.warn('Direct call to internal service rejected', {
      path: req.path,
      ip: req.ip,
      headers: Object.keys(req.headers),
    });
    return res.status(401).json({
      success: false,
      message: 'Request must come through API Gateway',
      code: 'GATEWAY_REQUIRED',
    });
  }

  // Reconstruct user from headers for downstream use
  req.gatewayUser = {
    userId,
    email: req.headers['x-user-email'],
    roles: roles.split(',').filter(r => r.startsWith('realm:')).map(r => r.replace('realm:', '')),
    realmRoles: roles.split(',').filter(r => r.startsWith('realm:')).map(r => r.replace('realm:', '')),
    clientRoles: roles.split(',').filter(r => r.startsWith('client:')).map(r => r.replace('client:', '')),
    merchantId: req.headers['x-merchant-id'] || null,
    requestId,
    correlationId: req.headers['x-correlation-id'],
  };

  next();
};

/**
 * Create a service-to-service request with proper headers
 * Usage in other services:
 * 
 * const response = await fetch('http://python-service/api/orders', {
 *   headers: createServiceHeaders(req)
 * });
 */
export const createServiceHeaders = (req) => {
  return {
    'X-User-ID': req.headers['x-user-id'],
    'X-User-Email': req.headers['x-user-email'],
    'X-Roles': req.headers['x-roles'],
    'X-Merchant-ID': req.headers['x-merchant-id'],
    'X-Request-ID': req.headers['x-request-id'],
    'X-Correlation-ID': req.headers['x-correlation-id'],
    'Content-Type': 'application/json',
  };
};

/**
 * Middleware to log gateway propagation for debugging
 */
export const logGatewayPropagation = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(body) {
    logger.debug('Gateway response', {
      path: req.path,
      userId: req.headers['x-user-id'],
      requestId: req.headers['x-request-id'],
      merchantId: req.headers['x-merchant-id'],
      statusCode: res.statusCode,
    });
    return originalSend.call(this, body);
  };
  
  next();
};

/**
 * Resource Ownership Middleware
 * Phase 2: Resource-Level Authorization
 *
 * These middleware functions check if the authenticated user owns a specific resource
 * or has elevated privileges to access/modify it.
 */

import logger from '../config/logger.js';
import pythonServiceClient from '../services/pythonServiceClient.js';

/**
 * Middleware factory to check resource ownership
 * Supports multiple ownership patterns:
 * - Direct ownership: resource.user_id === req.user.userId
 * - Merchant ownership: resource.merchant_id === req.user.merchantId
 * - Admin override: platform-admin, merchant-admin (for their merchants)
 *
 * @param {Object} options - Configuration options
 * @param {string} options.resourceType - Type of resource ('product', 'order', etc.)
 * @param {string} options.resourceIdParam - URL parameter name for resource ID (default: 'id')
 * @param {string} options.ownershipField - Field in resource to check for ownership (default: 'user_id')
 * @param {boolean} options.allowMerchantAdmin - Allow merchant-admin to access resources of their merchant
 * @param {boolean} options.allowPlatformAdmin - Allow platform-admin full access (default: true)
 * @param {boolean} options.allowResourceRead - Allow read access to all authenticated users (for public resources)
 */
export const requireOwnership = (options = {}) => {
  const {
    resourceType = 'resource',
    resourceIdParam = 'id',
    ownershipField = 'user_id',
    allowMerchantAdmin = false,
    allowPlatformAdmin = true,
    allowResourceRead = false,
  } = options;

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      // Platform admins have full access (if enabled)
      const isPlatformAdmin = req.user.realmRoles?.includes('platform-admin');
      if (allowPlatformAdmin && isPlatformAdmin) {
        logger.debug(`Platform admin ${req.user.email} granted access to ${resourceType}`);
        req.ownership = { isAdmin: true, level: 'platform' };
        return next();
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: `Resource ID parameter '${resourceIdParam}' is required`,
          code: 'MISSING_RESOURCE_ID',
        });
      }

      // Fetch the resource
      let resource;
      try {
        if (resourceType === 'product') {
          resource = await pythonServiceClient.getProductById(resourceId);
        } else if (resourceType === 'order') {
          resource = await pythonServiceClient.getOrderById(resourceId);
        } else {
          return res.status(500).json({
            success: false,
            message: `Unknown resource type: ${resourceType}`,
            code: 'UNKNOWN_RESOURCE_TYPE',
          });
        }
      } catch (error) {
        if (error.message?.includes('not found')) {
          return res.status(404).json({
            success: false,
            message: `${resourceType} not found`,
            code: 'RESOURCE_NOT_FOUND',
          });
        }
        throw error;
      }

      // Attach resource to request for downstream use
      req.resource = resource;

      // Check direct ownership
      const resourceOwnerId = resource[ownershipField];
      const isOwner = resourceOwnerId && resourceOwnerId === req.user.userId;

      // Check merchant-level access
      let isMerchantAdmin = false;
      if (allowMerchantAdmin && req.user.merchantId && resource.merchant_id) {
        const isSameMerchant = resource.merchant_id === req.user.merchantId;
        const hasMerchantAdminRole = req.user.realmRoles?.includes('merchant-admin');
        isMerchantAdmin = isSameMerchant && hasMerchantAdminRole;
      }

      // For read operations, allow if user has any access
      const isReadOperation = req.method === 'GET';
      if (isReadOperation && (isOwner || isMerchantAdmin)) {
        req.ownership = {
          isOwner,
          isMerchantAdmin,
          level: isOwner ? 'owner' : 'merchant',
        };
        return next();
      }

      // For write operations, require ownership or merchant admin
      if (isOwner) {
        req.ownership = { isOwner: true, level: 'owner' };
        return next();
      }

      if (isMerchantAdmin) {
        req.ownership = { isMerchantAdmin: true, level: 'merchant' };
        return next();
      }

      // Access denied
      logger.warn(
        `Access denied: User ${req.user.email} (${req.user.userId}) attempted to access ${resourceType} ${resourceId} owned by ${resourceOwnerId}`
      );

      return res.status(403).json({
        success: false,
        message: `You don't have permission to access this ${resourceType}`,
        code: 'ACCESS_DENIED',
        details: {
          resourceType,
          resourceId,
          requiredOwnership: ownershipField,
        },
      });
    } catch (error) {
      logger.error(`Ownership check failed for ${resourceType}:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify resource ownership',
        code: 'OWNERSHIP_CHECK_FAILED',
      });
    }
  };
};

/**
 * Require ownership of a product
 * - Product owner (created_by) can manage their products
 * - Merchant admin can manage products of their merchant
 * - Platform admin has full access
 */
export const requireProductOwnership = requireOwnership({
  resourceType: 'product',
  ownershipField: 'created_by',
  allowMerchantAdmin: true,
  allowPlatformAdmin: true,
});

/**
 * Require ownership of an order
 * - Order owner (user_id) can view/manage their orders
 * - Merchant admin can view orders containing their products
 * - Platform admin has full access
 */
export const requireOrderOwnership = requireOwnership({
  resourceType: 'order',
  ownershipField: 'user_id',
  allowMerchantAdmin: false, // Orders are customer-owned
  allowPlatformAdmin: true,
});

/**
 * Middleware to inject ownership filter into list queries
 * This modifies the query to only return resources the user owns
 *
 * @param {Object} options - Configuration options
 * @param {string} options.filterField - Field to filter by (default: 'user_id')
 * @param {boolean} options.allowMerchantFilter - Allow merchant-level filtering
 */
export const filterByOwnership = (options = {}) => {
  const {
    filterField = 'user_id',
    allowMerchantFilter = false,
  } = options;

  return (req, res, next) => {
    // Platform admins see all resources
    const isPlatformAdmin = req.user?.realmRoles?.includes('platform-admin');
    if (isPlatformAdmin) {
      req.ownershipFilter = {}; // No filter - see all
      return next();
    }

    // Merchant admins see their merchant's resources
    if (allowMerchantFilter && req.user?.realmRoles?.includes('merchant-admin') && req.user?.merchantId) {
      req.ownershipFilter = { merchant_id: req.user.merchantId };
      return next();
    }

    // Regular users see only their own resources
    if (req.user?.userId) {
      req.ownershipFilter = { [filterField]: req.user.userId };
      return next();
    }

    // Fallback: require authentication
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  };
};

/**
 * Combined middleware: Check both role permission AND ownership
 * Usage: requirePermissionAndOwnership('product:update', { resourceType: 'product' })
 */
export const requirePermissionAndOwnership = (requiredClientRole, ownershipOptions) => {
  const ownershipMiddleware = requireOwnership(ownershipOptions);

  return async (req, res, next) => {
    // First, check if user has the required client role
    if (requiredClientRole) {
      const [clientId, ...roleParts] = requiredClientRole.split(':');
      const role = roleParts.join(':');
      const clientRoles = req.user?.clientRoles?.[clientId] || [];

      if (!clientRoles.includes(role)) {
        // Check for realm admin override
        const isAdmin = req.user?.realmRoles?.some(r =>
          ['platform-admin', 'merchant-admin'].includes(r)
        );

        if (!isAdmin) {
          return res.status(403).json({
            success: false,
            message: `Permission '${requiredClientRole}' required`,
            code: 'PERMISSION_DENIED',
          });
        }
      }
    }

    // Then, check ownership
    ownershipMiddleware(req, res, next);
  };
};

/**
 * Middleware to set ownership fields on resource creation
 * Automatically injects user_id and merchant_id into request body
 *
 * @param {Object} options - Configuration options
 * @param {string} options.userIdField - Field name for user ID (default: 'user_id')
 * @param {string} options.merchantIdField - Field name for merchant ID (default: 'merchant_id')
 * @param {boolean} options.setMerchantId - Whether to set merchant_id (default: true)
 */
export const setOwnershipOnCreate = (options = {}) => {
  const {
    userIdField = 'user_id',
    merchantIdField = 'merchant_id',
    setMerchantId = true,
  } = options;

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    // Ensure body exists
    if (!req.body) {
      req.body = {};
    }

    // Set user ID
    req.body[userIdField] = req.user.userId;

    // Set merchant ID if user has one
    if (setMerchantId && req.user.merchantId) {
      req.body[merchantIdField] = req.user.merchantId;
    }

    logger.debug(`Set ownership on create: ${userIdField}=${req.user.userId}, ${merchantIdField}=${req.user.merchantId || 'null'}`);

    next();
  };
};

export default {
  requireOwnership,
  requireProductOwnership,
  requireOrderOwnership,
  filterByOwnership,
  requirePermissionAndOwnership,
  setOwnershipOnCreate,
};

/**
 * Phase 4: Attribute-Based Access Control (ABAC)
 * 
 * Fine-grained permissions based on:
 * - Keycloak Groups membership
 * - User attributes (graduationYear, earlyAccess, etc.)
 * - Combined with role checks
 */

import logger from '../config/logger.js';

/**
 * Check if user has a specific Keycloak group
 * Groups come in format: ["/Merchants/Amazon Partners", "/Class of 2022"]
 */
export const hasGroup = (userInfo, groupPath) => {
  const groups = userInfo.groups || [];
  return groups.some(g => g === groupPath || g.endsWith(`/${groupPath}`));
};

/**
 * Get user attribute from JWT claims
 * Attributes come in format: { "graduationYear": ["2022"], "earlyAccess": ["true"] }
 */
export const getAttribute = (userInfo, attrName, defaultValue = null) => {
  const attrs = userInfo.attributes || {};
  const val = attrs[attrName];
  if (Array.isArray(val) && val.length > 0) {
    return val[0];
  }
  return defaultValue;
};

/**
 * Get numeric attribute (for years, discounts, etc.)
 */
export const getNumericAttribute = (userInfo, attrName, defaultValue = 0) => {
  const val = getAttribute(userInfo, attrName);
  if (val === null) return defaultValue;
  const num = parseInt(val, 10);
  return isNaN(num) ? defaultValue : num;
};

/**
 * Get boolean attribute
 */
export const getBooleanAttribute = (userInfo, attrName, defaultValue = false) => {
  const val = getAttribute(userInfo, attrName);
  if (val === null) return defaultValue;
  return val === 'true' || val === '1' || val === 'yes';
};

/**
 * ABAC Policy: Can access early bird sale?
 * Requirements:
 * - User has 'Class of 2022' group OR
 * - User has earlyAccess=true attribute OR
 * - User has platform-admin role
 */
export const canAccessEarlySale = (userInfo) => {
  const has2022Group = hasGroup(userInfo, 'Class of 2022');
  const hasEarlyAccess = getBooleanAttribute(userInfo, 'earlyAccess');
  const isPlatformAdmin = (userInfo.realmRoles || []).includes('platform-admin');
  
  return has2022Group || hasEarlyAccess || isPlatformAdmin;
};

/**
 * ABAC Policy: Can get alumni discount?
 * Requirements:
 * - User has 'Class of 2022' group AND
 * - User has alumniDiscount=true attribute AND
 * - User graduationYear <= 2022
 */
export const canGetDiscount = (userInfo) => {
  const has2022Group = hasGroup(userInfo, 'Class of 2022');
  const hasAlumniDiscount = getBooleanAttribute(userInfo, 'alumniDiscount');
  const gradYear = getNumericAttribute(userInfo, 'graduationYear', 9999);
  
  return has2022Group && hasAlumniDiscount && gradYear <= 2022;
};

/**
 * ABAC Policy: Can access merchant-specific features?
 * Requirements:
 * - User belongs to the specified merchant group OR
 * - User's merchantId matches
 */
export const canAccessMerchantFeatures = (userInfo, merchantId) => {
  // Check direct merchantId match
  if (userInfo.merchantId === merchantId) {
    return true;
  }
  
  // Check group membership
  const merchantGroups = (userInfo.groups || [])
    .filter(g => g.includes('/Merchants/'))
    .map(g => g.split('/').pop());
  
  return merchantGroups.some(g => g.toLowerCase().includes(merchantId.toLowerCase()));
};

/**
 * ABAC Policy: Can access chapter events?
 * Requirements:
 * - User has Alumni Chapter {city} group
 */
export const canAccessChapterEvents = (userInfo, chapterCity) => {
  const chapterGroup = `/Alumni Chapter ${chapterCity}`;
  return hasGroup(userInfo, chapterGroup);
};

/**
 * Middleware factory: Require ABAC policy check
 * Usage:
 * router.get('/sales/early-bird', 
 *   keycloakAuthMiddleware,
 *   requireABAC((user) => canAccessEarlySale(user), 'Early bird sale'),
 *   getEarlyBirdSale
 * );
 */
export const requireABAC = (policyFn, resourceName = 'resource') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Build user info with attributes from token
    const userInfo = {
      ...req.user,
      attributes: req.user.attributes || extractAttributesFromToken(req.user),
    };

    if (policyFn(userInfo)) {
      // Store ABAC result for downstream use
      req.abac = {
        granted: true,
        policy: resourceName,
        userAttributes: userInfo.attributes,
      };
      logger.debug(`ABAC policy granted: ${resourceName}`, {
        userId: req.user.userId,
        attributes: userInfo.attributes,
      });
      return next();
    }

    logger.warn(`ABAC policy denied: ${resourceName}`, {
      userId: req.user.userId,
      groups: req.user.groups,
      attributes: userInfo.attributes,
    });

    return res.status(403).json({
      success: false,
      message: `Access denied to ${resourceName} based on user attributes`,
      code: 'ABAC_POLICY_DENIED',
      required_attributes: getRequiredAttributes(policyFn),
    });
  };
};

/**
 * Middleware: Require early bird sale access
 */
export const requireEarlySaleAccess = requireABAC(canAccessEarlySale, 'early bird sale');

/**
 * Middleware: Require alumni discount eligibility
 */
export const requireAlumniDiscount = requireABAC(canGetDiscount, 'alumni discount');

/**
 * Middleware: Check if user can access specific merchant features
 */
export const requireMerchantAccess = (merchantId) => {
  return requireABAC(
    (user) => canAccessMerchantFeatures(user, merchantId),
    `merchant features: ${merchantId}`
  );
};

/**
 * Helper to extract attributes from JWT token claims
 * Keycloak puts custom attributes under 'attributes' claim
 */
function extractAttributesFromToken(user) {
  // Attributes might come from the original token
  // If not present, return empty object
  return user.rawAttributes || {};
}

/**
 * Helper to get required attributes description
 */
function getRequiredAttributes(policyFn) {
  // Map policy functions to their requirements
  if (policyFn === canAccessEarlySale) {
    return [
      "Group: 'Class of 2022' OR",
      "Attribute: earlyAccess=true OR",
      "Role: platform-admin"
    ];
  }
  if (policyFn === canGetDiscount) {
    return [
      "Group: 'Class of 2022' AND",
      "Attribute: alumniDiscount=true AND",
      "Attribute: graduationYear <= 2022"
    ];
  }
  return [];
}

/**
 * Middleware to attach raw token attributes to user
 * Call this after auth middleware to enable ABAC checks
 */
export const attachUserAttributes = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  // Try to extract attributes from various sources
  let attributes = {};
  
  // Source 1: Direct from user object (if set)
  if (req.user.attributes) {
    attributes = { ...req.user.attributes };
  }
  
  // Source 2: From token (if available)
  if (req.user.token) {
    try {
      const tokenParts = req.user.token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        if (payload.attributes) {
          attributes = { ...attributes, ...payload.attributes };
        }
      }
    } catch (err) {
      // Ignore parsing errors
    }
  }
  
  req.user.attributes = attributes;
  req.user.rawAttributes = attributes;
  
  next();
};

export default {
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
};

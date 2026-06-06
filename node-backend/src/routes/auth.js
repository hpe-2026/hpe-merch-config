import express from 'express';
import { body, validationResult } from 'express-validator';
import axios from 'axios';
import keycloakConfig from '../config/keycloak.js';
import logger from '../config/logger.js';
import { authAttempts } from '../metrics.js';
import UserVerification from '../schemas/userVerification.js';
import {
  keycloakAuthMiddleware,
} from '../middleware/keycloak.js';

const router = express.Router();

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

const signupValidator = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('alumni_id')
    .optional()
    .trim()
    .isString()
    .withMessage('Alumni ID must be a string'),
];

const loginValidator = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const isAdminUser = (roles = []) => {
  if (!Array.isArray(roles)) {
    return false;
  }
  return roles.includes('admin') || roles.includes('super-admin') || roles.includes('platform-admin');
};

const isMerchantUser = (roles = []) => {
  if (!Array.isArray(roles)) {
    return false;
  }
  return roles.some(r => ['merchant', 'merchant-admin', 'merchant-staff', 'merchant-amazon', 'merchant-flipkart'].includes(r));
};

/**
 * POST /api/v1/admin/auth/register
 * Admin-only Keycloak auth route: public registration is disabled here
 * Body: { email, password, name, alumni_id }
 */
router.post('/register', signupValidator, handleValidationErrors, async (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Public Keycloak registration is disabled. Use /api/v1/auth/signup for alumni users.',
  });
});

/**
 * POST /api/v1/admin/auth/login
 * Login with email and password via Keycloak (admin users only)
 * Body: { email, password }
 */
router.post('/login', loginValidator, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Attempt to get token from Keycloak using resource owner password grant
    const loginResponse = await axios.post(
      keycloakConfig.getTokenUrl(),
      new URLSearchParams({
        grant_type: 'password',
        client_id: keycloakConfig.clientId,
        client_secret: keycloakConfig.clientSecret,
        username: email,
        password: password,
        scope: 'openid profile email',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        validateStatus: () => true,
      }
    );

    if (loginResponse.status === 401 || loginResponse.data?.error === 'unauthorized_client') {
      logger.warn('Login failed for user:', email);
      authAttempts.inc({ type: 'login', success: 'false' });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    if (loginResponse.status !== 200) {
      logger.error('Keycloak login failed:', loginResponse.data);
      authAttempts.inc({ type: 'login', success: 'false' });
      return res.status(401).json({
        success: false,
        message: 'Login failed',
      });
    }

    // Decode token to extract user info
    const accessToken = loginResponse.data.access_token;
    const decodedToken = keycloakConfig.decodeToken(accessToken);
    const userInfo = keycloakConfig.extractUserInfo(decodedToken);

    if (!isAdminUser(userInfo.roles) && !isMerchantUser(userInfo.roles)) {
      logger.warn('Unauthorized user attempted admin/merchant login', { email });
      authAttempts.inc({ type: 'login', success: 'forbidden' });
      return res.status(403).json({
        success: false,
        message: 'Admin or Merchant account required',
      });
    }

    // Sync Keycloak user to MongoDB (create record if doesn't exist)
    let userVerification = await UserVerification.findOne({ email });

    // Determine merchant_id from email domain for merchant users
    let merchantId = null;
    if (isMerchantUser(userInfo.roles)) {
      if (email.includes('amazon')) merchantId = 'amazon-store';
      else if (email.includes('flipkart')) merchantId = 'flipkart-store';
      else if (email.includes('nitte')) merchantId = 'nitte-official-store';
    }

    if (!userVerification) {
      // Create MongoDB record for Keycloak user
      userVerification = new UserVerification({
        user_id: userInfo.userId,
        email: userInfo.email,
        name: userInfo.name || email.split('@')[0],
        status: 'approved', // Keycloak users are pre-approved
        user_type: isAdminUser(userInfo.roles) ? 'admin' : 'merchant',
        merchant_id: merchantId,
        approved_by: 'keycloak-sync',
        approval_timestamp: new Date(),
      });
      await userVerification.save();
      logger.info('Created MongoDB record for Keycloak user', { email, userId: userInfo.userId, merchantId });
    } else if (merchantId && !userVerification.merchant_id) {
      // Update existing record with merchant_id if missing
      userVerification.merchant_id = merchantId;
      await userVerification.save();
      logger.info('Updated merchant_id for existing user', { email, merchantId });
    }

    logger.info('User logged in successfully', { email });
    authAttempts.inc({ type: 'login', success: 'true' });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        userId: userInfo.userId,
        email: userInfo.email,
        name: userInfo.name,
        roles: userInfo.roles,
      },
      tokens: {
        access_token: loginResponse.data.access_token,
        refresh_token: loginResponse.data.refresh_token,
        expires_in: loginResponse.data.expires_in,
      },
    });
  } catch (error) {
    logger.error('Login error:', error.message);
    authAttempts.inc({ type: 'login', success: 'false' });
    res.status(500).json({
      success: false,
      message: 'Login failed',
    });
  }
});

/**
 * POST /api/v1/admin/auth/refresh
 * Refresh access token using refresh token
 * Body: { refresh_token }
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    const refreshResponse = await axios.post(
      keycloakConfig.getTokenUrl(),
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: keycloakConfig.clientId,
        client_secret: keycloakConfig.clientSecret,
        refresh_token: refresh_token,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        validateStatus: () => true,
      }
    );

    if (refreshResponse.status !== 200) {
      logger.warn('Token refresh failed');
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      });
    }

    const refreshedAccessToken = refreshResponse.data.access_token;
    const refreshedDecoded = keycloakConfig.decodeToken(refreshedAccessToken);
    const refreshedUserInfo = keycloakConfig.extractUserInfo(refreshedDecoded);

    if (!isAdminUser(refreshedUserInfo.roles)) {
      logger.warn('Non-admin user attempted admin token refresh', {
        email: refreshedUserInfo.email,
      });
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    res.status(200).json({
      success: true,
      tokens: {
        access_token: refreshedAccessToken,
        refresh_token: refreshResponse.data.refresh_token,
        expires_in: refreshResponse.data.expires_in,
      },
    });
  } catch (error) {
    logger.error('Token refresh error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed',
    });
  }
});

/**
 * GET /api/v1/admin/auth/me
 * Get current authenticated user info
 */
router.get('/me', keycloakAuthMiddleware, async (req, res) => {
  try {
    if (!isAdminUser(req.user?.roles || [])) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        userId: req.user.userId,
        email: req.user.email,
        name: req.user.name,
        roles: req.user.roles,
        email_verified: req.user.email_verified,
      },
    });
  } catch (error) {
    logger.error('Failed to get current user:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get current user',
    });
  }
});

/**
 * POST /api/v1/admin/auth/logout
 * Logout user (revoke refresh token server-side)
 * Body: { refresh_token }
 */
router.post('/logout', keycloakAuthMiddleware, async (req, res) => {
  try {
    if (!isAdminUser(req.user?.roles || [])) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    const { refresh_token } = req.body;

    if (refresh_token) {
      // Optional: revoke token server-side
      try {
        await keycloakConfig.logout(refresh_token);
      } catch (error) {
        logger.warn('Server-side token revocation failed:', error.message);
        // Continue - client-side logout is still valid
      }
    }

    logger.info('User logged out', { email: req.user.email });
    res.status(200).json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    logger.error('Logout error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
});

/**
 * GET /health
 * Health check for auth service
 */
router.get('/health', async (req, res) => {
  try {
    const status = await keycloakConfig.getHealthStatus();
    res.status(200).json({
      success: true,
      message: 'Auth service is healthy',
      keycloak: status,
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Auth service is unavailable',
      error: error.message,
    });
  }
});

export default router;

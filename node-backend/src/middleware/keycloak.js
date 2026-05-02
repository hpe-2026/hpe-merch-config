/**
 * Keycloak Authentication Middleware
 * Validates Keycloak JWT tokens and extracts user information
 */

import keycloakConfig from '../config/keycloak.js';
import logger from '../config/logger.js';

/**
 * Keycloak authentication middleware
 * Extracts and validates Keycloak JWT token from Authorization header
 */
export const keycloakAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.substring(7);

    // Decode token
    const decodedToken = keycloakConfig.decodeToken(token);

    // Validate token claims
    keycloakConfig.validateTokenClaims(decodedToken);

    // Extract user information
    const userInfo = keycloakConfig.extractUserInfo(decodedToken);

    // Attach user to request
    req.user = {
      userId: userInfo.userId,
      email: userInfo.email,
      name: userInfo.name,
      roles: userInfo.roles,
      token: token,
      email_verified: userInfo.email_verified,
    };

    logger.debug(`Authenticated user: ${req.user.email} with roles: ${req.user.roles.join(', ')}`);

    next();
  } catch (error) {
    logger.warn(`Authentication failed: ${error.message}`);
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: error.message,
    });
  }
};

/**
 * Keycloak authorization middleware
 * Checks if user has required role(s)
 */
export const keycloakRequireRole = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
    }

    const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

    const hasRole = rolesArray.some((role) => req.user.roles.includes(role));

    if (!hasRole) {
      logger.warn(
        `User ${req.user.email} attempted access without required role(s): ${rolesArray.join(', ')}`
      );
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required_roles: rolesArray,
      });
    }

    next();
  };
};

/**
 * Optional Keycloak authentication
 * Attempts to authenticate but doesn't fail if token is missing
 */
export const keycloakOptionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Decode and validate
      const decodedToken = keycloakConfig.decodeToken(token);
      keycloakConfig.validateTokenClaims(decodedToken);

      const userInfo = keycloakConfig.extractUserInfo(decodedToken);

      req.user = {
        userId: userInfo.userId,
        email: userInfo.email,
        name: userInfo.name,
        roles: userInfo.roles,
        token: token,
        email_verified: userInfo.email_verified,
      };

      logger.debug(`Authenticated user: ${req.user.email}`);
    }
    // If no token, continue without user
    next();
  } catch (error) {
    logger.debug(`Optional auth skipped: ${error.message}`);
    // Continue without user for optional auth
    next();
  }
};

/**
 * Get current user endpoint
 * Returns authenticated user information
 */
export const getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
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
    logger.error('Error getting current user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get current user',
    });
  }
};

/**
 * Login endpoint
 * Accepts email and password, exchanges for Keycloak token
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Get token from Keycloak using resource owner password grant
    const response = await axios.post(
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
      }
    );

    const accessToken = response.data.access_token;
    const decodedToken = keycloakConfig.decodeToken(accessToken);
    const userInfo = keycloakConfig.extractUserInfo(decodedToken);

    // Check if user is verified in MongoDB
    try {
      const UserVerification = require('../models/UserVerification.js');
      const userVerification = await UserVerification.findOne({ email });
      
      if (userVerification && userVerification.status !== 'approved') {
        logger.warn('User login blocked - verification pending', {
          email,
          status: userVerification.status,
        });
        return res.status(403).json({
          success: false,
          message: `Account not approved yet. Status: ${userVerification.status || 'pending'}. Please wait for admin approval.`,
        });
      }
    } catch (dbError) {
      // Log but don't fail if MongoDB check fails - user still gets login attempt
      logger.warn('Failed to verify user status in MongoDB (continuing with login)', {
        email,
        error: dbError.message,
      });
    }

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
        access_token: accessToken,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
      },
    });
  } catch (error) {
    logger.error('Login failed:', error.message);

    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message,
    });
  }
};

/**
 * Register endpoint
 * Creates a new user in Keycloak
 */
export const register = async (req, res) => {
  try {
    const { email, password, name, alumni_id } = req.body;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and name are required',
        errors: [
          !email && 'Email is required',
          !password && 'Password is required',
          !name && 'Name is required',
        ].filter(Boolean),
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long',
      });
    }

    // Get admin token to create user in Keycloak
    const adminToken = await keycloakConfig.getAdminToken();

    // Create user in Keycloak
    const userPayload = {
      email,
      password,
      firstName: name.split(' ')[0],
      lastName: name.split(' ')[1] || '',
      attributes: {
        alumni_id: [alumni_id || ''],
      },
    };

    const createdUser = await keycloakConfig.createUser(userPayload, adminToken);

    // Extract user ID from location header or response
    const keycloakUserId = createdUser?.id || email;

    // Store user in MongoDB with verification status
    const newUser = {
      keycloak_id: keycloakUserId,
      email,
      name,
      alumni_id: alumni_id || '',
      verification_status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Save to MongoDB
    try {
      const User = require('../models/User');
      await User.create(newUser);
      logger.info('User saved to MongoDB:', { keycloak_id: keycloakUserId, email });
    } catch (dbError) {
      // Log but don't fail if MongoDB save fails
      logger.warn('Failed to save user to MongoDB (non-critical):', {
        error: dbError.message,
        keycloak_id: keycloakUserId,
        email,
      });
      // Continue with user registration even if MongoDB save fails
    }

    // Publish Kafka event for new user registration
    const kafkaProducer = req.app?.locals?.kafkaProducer;
    if (kafkaProducer) {
      await kafkaProducer.publishUserRegistrationEvent({
        _id: keycloakUserId,
        email,
        name,
        alumni_id,
      });
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Awaiting admin approval.',
      data: {
        userId: keycloakUserId,
        email,
        name,
        verification_status: 'pending',
      },
    });
  } catch (error) {
    logger.error('Registration failed:', error.message);

    // Handle duplicate email
    if (error.response?.status === 409 || error.message.includes('exists')) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message,
    });
  }
};

/**
 * Logout endpoint
 * Revokes token on server side
 */
export const logout = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    // Revoke token on Keycloak
    await keycloakConfig.logout(refresh_token);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
};

/**
 * Refresh token endpoint
 */
export const refreshTokenEndpoint = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    const tokens = await keycloakConfig.refreshToken(refresh_token);

    res.status(200).json({
      success: true,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
      },
    });
  } catch (error) {
    logger.error('Token refresh failed:', error.message);
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token',
    });
  }
};

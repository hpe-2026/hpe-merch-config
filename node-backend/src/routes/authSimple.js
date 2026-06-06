import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import logger from '../config/logger.js';
import config from '../config/index.js';
import keycloakConfig from '../config/keycloak.js';
import UserVerification from '../schemas/userVerification.js';
import { userRegistrationsTotal, authAttempts } from '../metrics.js';

const router = express.Router();

const JWT_SECRET = config.jwt_secret;
const JWT_EXPIRY = config.jwt_expiry;

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
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('user_type')
    .optional()
    .isIn(['alumni', 'non_alumni'])
    .withMessage('user_type must be alumni or non_alumni'),
  body('alumni_id')
    .if(body('user_type').equals('alumni'))
    .trim()
    .notEmpty()
    .withMessage('Alumni ID is required for alumni registration'),
];

const loginValidator = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

/**
 * POST /api/v1/auth/signup
 * Register alumni with details for admin approval
 */
router.post('/signup', signupValidator, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, name, alumni_id, department, graduation_year, user_type = 'alumni' } = req.body;
    const isAlumni = user_type === 'alumni';

    // Check if user already exists
    const exists = await UserVerification.findOne({ email });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Provision the user in Keycloak (disabled until admin approval)
    let keycloakUserId = null;
    try {
      const adminToken = await keycloakConfig.getAdminToken();
      const [firstName, ...rest] = (name || '').trim().split(/\s+/);
      const created = await keycloakConfig.createUser(
        {
          email,
          password,
          firstName: firstName || 'User',
          lastName: rest.join(' ') || 'Account',
          enabled: false, // Locked until approved
          emailVerified: false,
          attributes: {
            user_type: [user_type],
            alumni_id: [isAlumni ? (alumni_id || '') : ''],
            department: [isAlumni ? (department || '') : ''],
            graduation_year: [isAlumni && graduation_year ? String(graduation_year) : ''],
          },
        },
        adminToken
      );
      keycloakUserId = created?.id || null;
      logger.info('User provisioned in Keycloak', { email, keycloakUserId });
    } catch (kcError) {
      // If user already exists in Keycloak, look them up so we still link the records
      if (kcError.response?.status === 409) {
        try {
          const adminToken = await keycloakConfig.getAdminToken();
          const existing = await keycloakConfig.findUserByEmail(email, adminToken);
          keycloakUserId = existing?.id || null;
          logger.warn('Keycloak user already existed; linked to verification record', {
            email,
            keycloakUserId,
          });
        } catch (lookupErr) {
          logger.warn('Keycloak lookup after 409 failed:', lookupErr.message);
        }
      } else {
        // Non-critical: continue with Mongo-only record. Approval flow will retry.
        logger.warn('Keycloak provisioning failed (continuing with local record):', kcError.message);
      }
    }

    // Create user verification record
    const newUser = new UserVerification({
      user_id: keycloakUserId,
      email,
      name,
      alumni_id: isAlumni ? (alumni_id || '') : '',
      department: isAlumni ? (department || '') : '',
      graduation_year: isAlumni ? (graduation_year || '') : '',
      user_type,
      password: hashedPassword,
      status: 'pending',
      registration_timestamp: new Date(),
    });

    await newUser.save();
    userRegistrationsTotal.inc({ status: 'pending' });
    logger.info('User registered', { email, user_type, alumni_id: isAlumni ? alumni_id : null, keycloakUserId });

    const token = jwt.sign(
      {
        user_id: newUser._id,
        email: newUser.email,
        role: 'user',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.status(201).json({
      success: true,
      message: '✓ Registration successful! Your account is pending admin approval.',
      tokens: {
        access_token: token,
        refresh_token: token,
        expires_in: 604800,
      },
      data: {
        user_id: newUser._id,
        email,
        name,
        alumni_id,
        role: 'user',
        roles: ['user'],
        status: 'pending',
      },
    });
  } catch (error) {
    logger.error('Signup error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
    });
  }
});

/**
 * POST /api/v1/auth/login
 * Login for admin and approved alumni
 */
router.post('/login', loginValidator, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('[AUTH] Login endpoint hit:', email);

    // Find user
    const user = await UserVerification.findOne({ email });
    console.log('[AUTH] User found:', !!user, user?.email);
    logger.info('Login attempt', { email, userFound: !!user, userStatus: user?.status });
    
    if (!user) {
      logger.warn('Login failed - user not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if approved
    if (user.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: '⏳ Your account is pending admin approval. Please wait.',
      });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({
        success: false,
        message: '✗ Your account has been rejected.',
      });
    }

    // Preferred path: authenticate against Keycloak (Direct Grant) when this
    // user has been provisioned in the realm. This means the realm is the
    // single source of truth for credentials and roles.
    if (user.user_id) {
      try {
        const kcTokens = await keycloakConfig.passwordGrant(email, password);
        const decoded = keycloakConfig.decodeToken(kcTokens.access_token);
        const userInfo = keycloakConfig.extractUserInfo(decoded);

        logger.info('User logged in via Keycloak:', email);

        return res.status(200).json({
          success: true,
          message: 'Login successful',
          tokens: {
            access_token: kcTokens.access_token,
            refresh_token: kcTokens.refresh_token,
            expires_in: kcTokens.expires_in,
          },
          data: {
            user_id: user._id,
            keycloak_id: userInfo.userId,
            email: userInfo.email,
            name: user.name,
            alumni_id: user.alumni_id,
            role: userInfo.roles?.[0] || 'user',
            roles: userInfo.roles?.length ? userInfo.roles : ['user'],
            status: user.status,
            profileImage: user.profileImage || null,
            merchantName: user.merchantName || null,
            phone: user.phone || null,
            address: user.address || null,
            description: user.description || null,
          },
        });
      } catch (kcErr) {
        // Keycloak rejected the password (or is down). If Keycloak is
        // reachable and just said "invalid credentials", trust that verdict
        // and don't silently fall through to the local check.
        const status = kcErr.status;
        if (status === 401 || status === 400) {
          logger.warn('Keycloak rejected login for:', email);
          return res.status(401).json({
            success: false,
            message: 'Invalid email or password',
          });
        }
        // Otherwise (Keycloak unreachable, etc.) fall through to local auth.
        logger.warn('Keycloak login unavailable, falling back to local:', kcErr.message);
      }
    }

    // Fallback: local bcrypt verification (legacy users without a Keycloak ID,
    // or Keycloak temporarily down). Issues a locally-signed JWT.
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      logger.warn('Login failed - incorrect password:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const token = jwt.sign(
      {
        user_id: user._id,
        email: user.email,
        role: user.role || 'user',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    logger.info('User logged in via local fallback:', email);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      tokens: {
        access_token: token,
        refresh_token: token,
        expires_in: 604800,
      },
      data: {
        user_id: user._id,
        email: user.email,
        name: user.name,
        alumni_id: user.alumni_id,
        role: user.role || 'user',
        roles: [user.role || 'user'],
        status: user.status,
        profileImage: user.profileImage || null,
        merchantName: user.merchantName || null,
        phone: user.phone || null,
        address: user.address || null,
        description: user.description || null,
      },
    });
  } catch (error) {
    logger.error('Login error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Login failed',
    });
  }
});

/**
 * Middleware to verify JWT token
 */
export const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No authorization token provided',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

export default router;

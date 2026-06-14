/**
 * Admin User Verification Routes
 * Handles approval and rejection of pending user registrations
 */

import express from 'express';
import axios from 'axios';
import { body, param, validationResult } from 'express-validator';
import keycloakConfig from '../config/keycloak.js';
import logger from '../config/logger.js';
import { authMiddleware } from '../middleware/index.js';
import User from '../schemas/user.js';

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

/**
 * Helper: Add a named role to a Keycloak user (idempotent — creates role if missing).
 */
const addRoleToKeycloak = async (keycloakUserId, roleName, roleDescription, adminToken) => {
  const rolesResponse = await axios.get(
    `${keycloakConfig.getRealmUrl()}/roles`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );

  const roleExists = (rolesResponse.data || []).some(r => r.name === roleName);

  if (!roleExists) {
    try {
      await axios.post(
        `${keycloakConfig.getRealmUrl()}/roles`,
        { name: roleName, description: roleDescription },
        {
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
      logger.info(`Created role '${roleName}' in Keycloak`);
    } catch (roleError) {
      logger.warn(`Role '${roleName}' creation failed or already exists:`, roleError.message);
    }
  }

  const roleResponse = await axios.get(
    `${keycloakConfig.getRealmUrl()}/roles/${roleName}`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );

  await axios.post(
    `${keycloakConfig.getRealmUrl()}/users/${keycloakUserId}/role-mappings/realm`,
    [roleResponse.data],
    {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  logger.info(`Added role '${roleName}' to user in Keycloak`, { keycloakUserId });
};

const addAlumniRoleToKeycloak = (keycloakUserId, adminToken) =>
  addRoleToKeycloak(keycloakUserId, 'alumni', 'Verified alumni user', adminToken);

const addNonAlumniRoleToKeycloak = (keycloakUserId, adminToken) =>
  addRoleToKeycloak(keycloakUserId, 'non_alumni', 'Non-alumni user with limited access', adminToken);

/**
 * Helper: Add client roles to a Keycloak user (for nitte-client)
 * Creates roles if they don't exist yet.
 */
const addClientRolesToKeycloak = async (keycloakUserId, clientId, roleNames, adminToken) => {
  try {
    // Get the client UUID first
    const clientsResponse = await axios.get(
      `${keycloakConfig.getRealmUrl()}/clients`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        params: { clientId },
      }
    );

    const client = clientsResponse.data.find(c => c.clientId === clientId);
    if (!client) {
      logger.warn(`Client '${clientId}' not found in Keycloak`);
      return;
    }

    // Get available client roles
    const rolesResponse = await axios.get(
      `${keycloakConfig.getRealmUrl()}/clients/${client.id}/roles`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    const availableRoles = rolesResponse.data || [];

    // Create any missing client roles
    for (const roleName of roleNames) {
      if (!availableRoles.some(r => r.name === roleName)) {
        try {
          await axios.post(
            `${keycloakConfig.getRealmUrl()}/clients/${client.id}/roles`,
            { name: roleName, description: `Auto-created: ${roleName}` },
            {
              headers: {
                Authorization: `Bearer ${adminToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          logger.info(`Created client role '${roleName}' in ${clientId}`);
        } catch (createErr) {
          if (createErr.response?.status !== 409) {
            logger.warn(`Failed to create client role '${roleName}':`, createErr.message);
          }
        }
      }
    }

    // Re-fetch roles after creation
    const updatedRolesResponse = await axios.get(
      `${keycloakConfig.getRealmUrl()}/clients/${client.id}/roles`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    const updatedRoles = updatedRolesResponse.data || [];
    const rolesToAssign = updatedRoles.filter(r => roleNames.includes(r.name));

    if (rolesToAssign.length === 0) {
      logger.warn(`Still no matching client roles for ${clientId}: ${roleNames.join(', ')}`);
      return;
    }

    // Assign client roles to user
    await axios.post(
      `${keycloakConfig.getRealmUrl()}/users/${keycloakUserId}/role-mappings/clients/${client.id}`,
      rolesToAssign,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info(`Added client roles [${rolesToAssign.map(r => r.name).join(', ')}] to user`, { keycloakUserId, clientId });
  } catch (error) {
    logger.error(`Failed to add client roles to user:`, error.message);
    // Non-fatal - continue with realm role assignment
  }
};

/**
 * Helper: Disable user in Keycloak
 */
const disableUserInKeycloak = async (keycloakUserId, adminToken) => {
  try {
    await axios.put(
      `${keycloakConfig.getRealmUrl()}/users/${keycloakUserId}`,
      {
        enabled: false,
      },
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('Disabled user in Keycloak', { keycloakUserId });
    return true;
  } catch (error) {
    logger.warn('Failed to disable user in Keycloak:', error.message);
    // Non-critical failure - user is still marked rejected in database
    return false;
  }
};

/**
 * Helper: Ensure an approved user exists in Keycloak, is enabled, and has the correct role.
 * Assigns 'alumni' or 'non_alumni' based on verification.user_type.
 * Throws on any Keycloak error so callers can decide how to handle it.
 */
const findOrCreateKeycloakUser = async (verification, adminToken) => {
  const existing = await keycloakConfig.findUserByEmail(verification.email, adminToken);
  if (existing?.id) {
    return existing.id;
  }
  const [firstName, ...rest] = (verification.name || '').trim().split(/\s+/);
  const created = await keycloakConfig.createUser(
    {
      email: verification.email,
      password: Math.random().toString(36).slice(2) + 'Aa1!',
      firstName: firstName || 'User',
      lastName: rest.join(' ') || 'Account',
      enabled: true,
      emailVerified: true,
      attributes: {
        alumni_id: [verification.alumni_id || ''],
        department: [verification.department || ''],
      },
    },
    adminToken
  );
  return created?.id || null;
};

const syncApprovedUserToKeycloak = async (verification) => {
  const adminToken = await keycloakConfig.getAdminToken();

  // If we don't yet have a Keycloak ID, look the user up or create them.
  if (!verification.user_id) {
    const userId = await findOrCreateKeycloakUser(verification, adminToken);
    if (userId) {
      verification.user_id = userId;
      await verification.save();
    }
  }

  if (!verification.user_id) {
    throw new Error('Approved user could not be linked to a Keycloak record');
  }

  const assignRole = verification.user_type === 'non_alumni'
    ? (id, token) => addNonAlumniRoleToKeycloak(id, token)
    : (id, token) => addAlumniRoleToKeycloak(id, token);

  try {
    // Enable the account (idempotent if already enabled)
    await keycloakConfig.setUserEnabled(verification.user_id, true, adminToken);

    // Mark email as verified so Keycloak UI shows "Verified"
    await keycloakConfig.setUserEmailVerified(verification.user_id, true, adminToken);

    // Assign the correct role based on user_type
    await assignRole(verification.user_id, adminToken);

    // Assign order permission roles (as realm roles since service account can manage those)
    const permissionRoles = ['order:create', 'order:update', 'order:read-own'];
    for (const roleName of permissionRoles) {
      try {
        await addRoleToKeycloak(verification.user_id, roleName, `Permission: ${roleName}`, adminToken);
      } catch (roleErr) {
        logger.warn(`Failed to assign realm role '${roleName}':`, roleErr.message);
      }
    }
  } catch (err) {
    // If the stored user_id is stale (Keycloak returns 404), clear it and retry.
    if (err.response?.status === 404) {
      logger.warn('Stored Keycloak user_id is stale; re-linking user', {
        email: verification.email,
        stale_id: verification.user_id,
      });
      verification.user_id = null;
      const userId = await findOrCreateKeycloakUser(verification, adminToken);
      if (userId) {
        verification.user_id = userId;
        await verification.save();
        await keycloakConfig.setUserEnabled(verification.user_id, true, adminToken);
        await keycloakConfig.setUserEmailVerified(verification.user_id, true, adminToken);
        await assignRole(verification.user_id, adminToken);

        // Retry realm role assignment for permissions
        const permRoles = ['order:create', 'order:update', 'order:read-own'];
        for (const roleName of permRoles) {
          try {
            await addRoleToKeycloak(verification.user_id, roleName, `Permission: ${roleName}`, adminToken);
          } catch (e) { /* ignore */ }
        }
      } else {
        throw new Error('Approved user could not be re-linked to Keycloak after stale ID cleared');
      }
    } else {
      throw err;
    }
  }

  logger.info('Successfully synced approved user to Keycloak', {
    user_id: verification.user_id,
    email: verification.email,
  });
};

/**
 * Middleware: Verify admin role
 */
const requireAdminRole = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authenticated',
    });
  }

  const isAdmin = req.user.roles && (
    req.user.roles.includes('admin') ||
    req.user.roles.includes('platform-admin') ||
    req.user.roles.includes('super-admin')
  );
  if (!isAdmin) {
    logger.warn(`Unauthorized admin access attempt by ${req.user.email}`);
    return res.status(403).json({
      success: false,
      message: 'Admin role required',
      user_roles: req.user.roles || [],
    });
  }

  next();
};

/**
 * GET /api/v1/admin/users/stats/verification
 * Aggregate counts for the admin dashboard.
 * NOTE: This must be registered BEFORE any "/:user_id/..." routes so Express
 * doesn't match "stats" as a user_id.
 */
router.get('/stats/verification', authMiddleware, requireAdminRole, async (req, res) => {
  try {
    const stats = await User.getStats();
    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    logger.error('Failed to get verification stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get verification stats',
    });
  }
});

/**
 * GET /api/v1/admin/users/unverified
 * Get list of unverified users
 * Query params: skip, limit, sort_by
 */
router.get(
  '/unverified',
  authMiddleware,
  requireAdminRole,
  async (req, res) => {
    try {
      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 10;
      const sortBy = req.query.sort_by || 'registration_timestamp';

      // Validate limit to prevent abuse
      const maxLimit = 100;
      const validLimit = Math.min(Math.max(limit, 1), maxLimit);

      // Fetch unverified users from database
      const unverifiedUsers = await User.findUnverified(skip, validLimit, sortBy);
      const total = await User.countUnverified();

      res.status(200).json({
        success: true,
        data: {
          users: unverifiedUsers.map(u => ({
            _id: u._id,
            user_id: u.user_id,
            email: u.email,
            name: u.name,
            alumni_id: u.alumni_id,
            department: u.department,
            graduation_year: u.graduation_year,
            registration_timestamp: u.registration_timestamp,
            status: u.status,
          })),
          total,
          skip,
          limit: validLimit,
        },
      });
    } catch (error) {
      logger.error('Failed to fetch unverified users:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch unverified users',
      });
    }
  }
);

/**
 * GET /api/v1/admin/users/verified
 * Get list of verified/approved users
 * Query params: skip, limit, sort_by
 */
router.get(
  '/verified',
  authMiddleware,
  requireAdminRole,
  async (req, res) => {
    try {
      const skip = parseInt(req.query.skip) || 0;
      const limit = parseInt(req.query.limit) || 10;
      const sortBy = req.query.sort_by || '-approval_timestamp';

      // Validate limit to prevent abuse
      const maxLimit = 100;
      const validLimit = Math.min(Math.max(limit, 1), maxLimit);

      // Fetch verified (approved) users from database
      const verifiedUsers = await User.find({ status: 'approved' })
        .sort(sortBy)
        .skip(skip)
        .limit(validLimit)
        .lean();

      const total = await User.countDocuments({ status: 'approved' });

      res.status(200).json({
        success: true,
        data: {
          users: verifiedUsers.map(u => ({
            _id: u._id,
            user_id: u.user_id,
            email: u.email,
            name: u.name,
            alumni_id: u.alumni_id,
            department: u.department,
            graduation_year: u.graduation_year,
            approval_timestamp: u.approval_timestamp,
            approved_by: u.approved_by,
            status: u.status,
          })),
          total,
          skip,
          limit: validLimit,
        },
      });
    } catch (error) {
      logger.error('Failed to fetch verified users:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch verified users',
      });
    }
  }
);

/**
 * GET /api/v1/admin/users/:user_id/verification
 * Get detailed verification record for a user
 */
router.get(
  '/:user_id/verification',
  authMiddleware,
  requireAdminRole,
  param('user_id').notEmpty().withMessage('User ID is required'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { user_id } = req.params;

      // Try MongoDB _id first (used by frontend), then fall back to user_id field
      let verification = await User.findById(user_id).catch(() => null);
      if (!verification) {
        verification = await User.findOne({ user_id });
      }

      if (!verification) {
        return res.status(404).json({
          success: false,
          message: 'User verification record not found',
        });
      }

      res.status(200).json({
        success: true,
        data: {
          _id: verification._id,
          user_id: verification.user_id,
          email: verification.email,
          name: verification.name,
          alumni_id: verification.alumni_id,
          department: verification.department,
          graduation_year: verification.graduation_year,
          status: verification.status,
          registration_timestamp: verification.registration_timestamp,
          approved_by: verification.approved_by,
          approval_timestamp: verification.approval_timestamp,
          approval_reason: verification.approval_reason,
          rejected_by: verification.rejected_by,
          rejection_timestamp: verification.rejection_timestamp,
          rejection_reason: verification.rejection_reason,
          events: verification.events,
        },
      });
    } catch (error) {
      logger.error('Failed to fetch user verification:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch user verification',
      });
    }
  }
);

/**
 * POST /api/v1/admin/users/:user_id/approve
 * Approve a pending user registration
 * Body: { approval_reason }
 */
router.post(
  '/:user_id/approve',
  authMiddleware,
  requireAdminRole,
  param('user_id').notEmpty().withMessage('User ID is required'),
  body('approval_reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Approval reason must be less than 500 characters'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { user_id } = req.params;
      const { approval_reason = 'Verified' } = req.body;
      const adminEmail = req.user?.email || 'admin@system.local';

      // Fetch verification record by _id (MongoDB ID) or user_id
      let verification = await User.findById(user_id);
      if (!verification) {
        verification = await User.findOne({ user_id });
      }

      if (!verification) {
        return res.status(404).json({
          success: false,
          message: 'User verification record not found',
        });
      }

      // Idempotent re-sync for already-approved users
      if (verification.status === 'approved') {
        try {
          await syncApprovedUserToKeycloak(verification);
        } catch (kcError) {
          logger.error('Failed to re-sync approved user with Keycloak:', kcError.message);
          return res.status(502).json({
            success: false,
            message: 'User already approved but Keycloak re-sync failed',
            error: kcError.message,
          });
        }
        return res.status(200).json({
          success: true,
          message: 'User already approved; re-synced with Keycloak',
          data: {
            user_id,
            email: verification.email,
            status: 'approved',
            approval_timestamp: verification.approval_timestamp,
            approved_by: verification.approved_by,
          },
        });
      }

      if (verification.status !== 'pending') {
        return res.status(410).json({
          success: false,
          message: `User cannot be approved. Current status: ${verification.status}`,
        });
      }

      // Update verification record with approval
      verification.status = 'approved';
      verification.approved_by = adminEmail;
      verification.approval_timestamp = new Date();
      verification.approval_reason = approval_reason;
      verification.events.push({
        type: 'approved',
        timestamp: new Date(),
        actor: adminEmail,
        reason: approval_reason,
      });

      await verification.save();

      // Sync with Keycloak (hard requirement)
      try {
        await syncApprovedUserToKeycloak(verification);
      } catch (kcError) {
        logger.error('Failed to sync approved user with Keycloak:', kcError.message);
        return res.status(502).json({
          success: false,
          message: 'User approved in database but Keycloak sync failed',
          error: kcError.message,
        });
      }

      // Publish Kafka event for downstream services (notifications, etc)
      const kafkaProducer = req.app?.locals?.kafkaProducer;
      if (kafkaProducer) {
        try {
          await kafkaProducer.publishUserApprovedEvent(
            user_id,
            verification.email,
            adminEmail,
            approval_reason
          );
          logger.info('Published user-approved event to Kafka', {
            user_id,
            email: verification.email,
          });
        } catch (kafkaError) {
          logger.warn('Failed to publish approval event to Kafka:', kafkaError.message);
          // Non-critical, continue - user is still approved in DB
        }
      }

      logger.info(`User ${user_id} approved by ${adminEmail}`, {
        email: verification.email,
        approval_reason,
      });

      res.status(200).json({
        success: true,
        message: 'User approved successfully',
        data: {
          user_id,
          email: verification.email,
          status: 'approved',
          approval_timestamp: verification.approval_timestamp,
          approved_by: verification.approved_by,
        },
      });
    } catch (error) {
      logger.error('Failed to approve user:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to approve user',
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/v1/admin/users/:user_id/reject
 * Reject a pending user registration
 * Body: { rejection_reason }
 */
router.post(
  '/:user_id/reject',
  authMiddleware,
  requireAdminRole,
  param('user_id').notEmpty().withMessage('User ID is required'),
  body('rejection_reason')
    .trim()
    .notEmpty()
    .withMessage('Rejection reason is required')
    .isLength({ max: 500 })
    .withMessage('Rejection reason must be less than 500 characters'),
  handleValidationErrors,
  async (req, res) => {
    try {
      const { user_id } = req.params;
      const { rejection_reason } = req.body;
      const adminEmail = req.user?.email || 'admin@system.local';

      // Fetch verification record by _id (MongoDB ID) or user_id
      let verification = await User.findById(user_id);
      if (!verification) {
        verification = await User.findOne({ user_id });
      }

      if (!verification) {
        return res.status(404).json({
          success: false,
          message: 'User verification record not found',
        });
      }

      if (verification.status !== 'pending') {
        return res.status(410).json({
          success: false,
          message: `User cannot be rejected. Current status: ${verification.status}`,
        });
      }

      // Update verification record with rejection
      verification.status = 'rejected';
      verification.rejected_by = adminEmail;
      verification.rejection_timestamp = new Date();
      verification.rejection_reason = rejection_reason;
      verification.events.push({
        type: 'rejected',
        timestamp: new Date(),
        actor: adminEmail,
        reason: rejection_reason,
      });

      await verification.save();

      // Optionally disable user in Keycloak upon rejection
      if (verification.user_id) {
        try {
          const adminToken = await keycloakConfig.getAdminToken();
          const userDisabled = await disableUserInKeycloak(verification.user_id, adminToken);
          if (userDisabled) {
            logger.info('Successfully disabled rejected user in Keycloak', {
              user_id: verification.user_id,
              email: verification.email,
            });
          }
        } catch (keycloakError) {
          logger.warn('Failed to disable user in Keycloak:', keycloakError.message);
          // Non-critical - user is still rejected in DB
        }
      }

      // Publish Kafka event for downstream services (notifications, etc)
      const kafkaProducer = req.app?.locals?.kafkaProducer;
      if (kafkaProducer) {
        try {
          await kafkaProducer.publishUserRejectedEvent(
            user_id,
            verification.email,
            adminEmail,
            rejection_reason
          );
          logger.info('Published user-rejected event to Kafka', {
            user_id,
            email: verification.email,
          });
        } catch (kafkaError) {
          logger.warn('Failed to publish rejection event to Kafka:', kafkaError.message);
          // Non-critical, continue - user is still rejected in DB
        }
      }

      logger.info(`User ${user_id} rejected by ${adminEmail}`, {
        email: verification.email,
        rejection_reason,
      });

      res.status(200).json({
        success: true,
        message: 'User rejected successfully',
        data: {
          user_id,
          email: verification.email,
          status: 'rejected',
          rejection_timestamp: verification.rejection_timestamp,
          rejected_by: verification.rejected_by,
        },
      });
    } catch (error) {
      logger.error('Failed to reject user:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to reject user',
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/v1/admin/users/sync-to-keycloak
 * Bulk sync all approved users to Keycloak (repair utility).
 */
router.post(
  '/sync-to-keycloak',
  authMiddleware,
  requireAdminRole,
  async (req, res) => {
    try {
      const approvedUsers = await User.find({ status: 'approved' }).lean();
      const results = { synced: [], failed: [] };

      for (const user of approvedUsers) {
        try {
          const verification = await User.findById(user._id);
          await syncApprovedUserToKeycloak(verification);
          results.synced.push({
            email: user.email,
            user_id: verification.user_id,
          });
        } catch (err) {
          logger.warn(`Bulk sync failed for ${user.email}:`, err.message);
          results.failed.push({
            email: user.email,
            error: err.message,
          });
        }
      }

      res.status(200).json({
        success: true,
        message: `Synced ${results.synced.length} users; ${results.failed.length} failures`,
        data: results,
      });
    } catch (error) {
      logger.error('Bulk sync to Keycloak failed:', error.message);
      res.status(500).json({
        success: false,
        message: 'Bulk sync failed',
        error: error.message,
      });
    }
  }
);

export default router;


/**
 * POST /api/v1/admin/users/keycloak-webhook
 * Webhook endpoint for Keycloak events — triggers user sync
 * Called by notification-service or Keycloak event listener
 */
router.post('/keycloak-webhook', async (req, res) => {
  try {
    const syncKeycloakUsers = (await import('../scripts/syncKeycloakUsers.js')).default;
    const result = await syncKeycloakUsers();
    res.status(200).json({ success: true, message: 'Sync triggered', data: result });
  } catch (error) {
    logger.error('Keycloak webhook sync failed:', error.message);
    res.status(500).json({ success: false, message: 'Sync failed', error: error.message });
  }
});

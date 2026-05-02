/**
 * NITTE Admin Policy Routes
 * 
 * Admin endpoints for managing RBAC policies.
 * All endpoints require admin role.
 */

import express from 'express';
import { authMiddleware } from '../middleware/index.js';
import { requireAdmin } from '../middleware/policyMiddleware.js';
import logger from '../config/logger.js';

const router = express.Router();

/**
 * Inject dependencies via factory function
 * @param {PolicyEngine} policyEngine - Policy engine instance
 * @param {PolicyRepository} policyRepository - Policy repository instance
 */
export const createAdminPolicyRoutes = (policyEngine, policyRepository) => {
  /**
   * GET /admin/policies
   * List all policies with optional filtering
   */
  router.get('/', authMiddleware, requireAdmin(), async (req, res) => {
    try {
      const { tags, roles, actions, enabled } = req.query;

      const filters = {};
      if (tags) filters.tags = Array.isArray(tags) ? tags : [tags];
      if (roles) filters.roles = Array.isArray(roles) ? roles : [roles];
      if (actions) filters.actions = Array.isArray(actions) ? actions : [actions];
      if (enabled !== undefined) filters.enabled = enabled === 'true';

      const policies = await policyRepository.findAll(filters);
      const count = await policyRepository.count(filters);

      res.status(200).json({
        success: true,
        message: 'Policies retrieved successfully',
        data: {
          policies,
          count,
          filters,
        },
      });

      logger.info(`Admin listed policies - count: ${count}, filters: ${JSON.stringify(filters)}`);
    } catch (error) {
      logger.error(`Error listing policies: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve policies',
        error: error.message,
      });
    }
  });

  /**
   * GET /admin/policies/:id
   * Get specific policy by ID
   */
  router.get('/:id', authMiddleware, requireAdmin(), async (req, res) => {
    try {
      const { id } = req.params;

      const policy = await policyRepository.findById(id);

      if (!policy) {
        return res.status(404).json({
          success: false,
          message: 'Policy not found',
          code: 'POLICY_NOT_FOUND',
          policyId: id,
        });
      }

      res.status(200).json({
        success: true,
        message: 'Policy retrieved successfully',
        data: { policy },
      });

      logger.info(`Admin viewed policy: ${policy.name}`);
    } catch (error) {
      logger.error(`Error retrieving policy: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve policy',
        error: error.message,
      });
    }
  });

  /**
   * POST /admin/policies
   * Create a new policy
   */
  router.post('/', authMiddleware, requireAdmin(), async (req, res) => {
    try {
      const {
        name,
        description,
        actions,
        roles = [],
        effect = 'allow',
        conditions = [],
        enabled = true,
        priority = 0,
        tags = [],
      } = req.body;

      // Validation
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Policy name is required',
          code: 'VALIDATION_ERROR',
          errors: { name: 'Name cannot be empty' },
        });
      }

      if (!actions || !Array.isArray(actions) || actions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Actions array is required and cannot be empty',
          code: 'VALIDATION_ERROR',
          errors: { actions: 'Must provide at least one action' },
        });
      }

      if (!['allow', 'deny'].includes(effect)) {
        return res.status(400).json({
          success: false,
          message: 'Effect must be "allow" or "deny"',
          code: 'VALIDATION_ERROR',
          errors: { effect: 'Invalid effect value' },
        });
      }

      // Create policy
      const policyData = {
        name,
        description,
        actions,
        roles,
        effect,
        conditions,
        enabled,
        priority: Number(priority),
        tags,
        createdBy: req.user.id,
        lastModifiedBy: req.user.id,
      };

      const policy = await policyRepository.create(policyData);

      // Clear cache for affected actions
      policyEngine.clearActionCache(actions);

      res.status(201).json({
        success: true,
        message: 'Policy created successfully',
        data: { policy },
      });

      logger.info(`Admin created policy: ${policy.name} (ID: ${policy._id})`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: error.message,
          code: 'DUPLICATE_POLICY',
        });
      }

      logger.error(`Error creating policy: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to create policy',
        error: error.message,
      });
    }
  });

  /**
   * PUT /admin/policies/:id
   * Update a policy
   */
  router.put('/:id', authMiddleware, requireAdmin(), async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // When updating actions, clear cache
      const existingPolicy = await policyRepository.findById(id);
      if (!existingPolicy) {
        return res.status(404).json({
          success: false,
          message: 'Policy not found',
          code: 'POLICY_NOT_FOUND',
        });
      }

      // Add audit trail
      updateData.lastModifiedBy = req.user.id;

      const updated = await policyRepository.update(id, updateData);

      if (updated && updateData.actions) {
        policyEngine.clearActionCache([...existingPolicy.actions, ...updateData.actions]);
      }

      res.status(200).json({
        success: true,
        message: 'Policy updated successfully',
        data: { policy: updated },
      });

      logger.info(`Admin updated policy: ${updated.name}`);
    } catch (error) {
      logger.error(`Error updating policy: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to update policy',
        error: error.message,
      });
    }
  });

  /**
   * DELETE /admin/policies/:id
   * Delete a policy
   */
  router.delete('/:id', authMiddleware, requireAdmin(), async (req, res) => {
    try {
      const { id } = req.params;

      const policy = await policyRepository.findById(id);

      if (!policy) {
        return res.status(404).json({
          success: false,
          message: 'Policy not found',
          code: 'POLICY_NOT_FOUND',
        });
      }

      const deleted = await policyRepository.delete(id);

      if (deleted) {
        // Clear cache
        policyEngine.clearActionCache(policy.actions);

        res.status(204).send();
        logger.info(`Admin deleted policy: ${policy.name}`);
      } else {
        res.status(404).json({
          success: false,
          message: 'Policy not found',
        });
      }
    } catch (error) {
      logger.error(`Error deleting policy: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to delete policy',
        error: error.message,
      });
    }
  });

  /**
   * POST /admin/policies/:id/enable
   * Enable a policy
   */
  router.post('/:id/enable', authMiddleware, requireAdmin(), async (req, res) => {
    try {
      const { id } = req.params;

      const policy = await policyRepository.enable(id);

      if (!policy) {
        return res.status(404).json({
          success: false,
          message: 'Policy not found',
        });
      }

      policyEngine.clearActionCache(policy.actions);

      res.status(200).json({
        success: true,
        message: 'Policy enabled successfully',
        data: { policy },
      });

      logger.info(`Admin enabled policy: ${policy.name}`);
    } catch (error) {
      logger.error(`Error enabling policy: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to enable policy',
        error: error.message,
      });
    }
  });

  /**
   * POST /admin/policies/:id/disable
   * Disable a policy
   */
  router.post('/:id/disable', authMiddleware, requireAdmin(), async (req, res) => {
    try {
      const { id } = req.params;

      const policy = await policyRepository.disable(id);

      if (!policy) {
        return res.status(404).json({
          success: false,
          message: 'Policy not found',
        });
      }

      policyEngine.clearActionCache(policy.actions);

      res.status(200).json({
        success: true,
        message: 'Policy disabled successfully',
        data: { policy },
      });

      logger.info(`Admin disabled policy: ${policy.name}`);
    } catch (error) {
      logger.error(`Error disabling policy: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to disable policy',
        error: error.message,
      });
    }
  });

  return router;
};

export default router;

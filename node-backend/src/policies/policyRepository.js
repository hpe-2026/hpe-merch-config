/**
 * NITTE Policy Repository
 * 
 * Handles all database interactions for policies.
 * Uses MongoDB to store and retrieve policy definitions.
 */

import mongoose from 'mongoose';
import logger from '../config/logger.js';

// Policy Schema
const policySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      description: 'Friendly name for the policy (e.g., "Allow authenticated users to view products")',
    },
    description: {
      type: String,
      trim: true,
      description: 'Detailed description of what this policy does',
    },
    actions: {
      type: [String],
      required: true,
      description: 'List of actions this policy applies to (e.g., ["list_products", "view_product"])',
    },
    roles: {
      type: [String],
      default: [],
      description: 'Roles this policy applies to (empty = all roles). Examples: ["guest", "user", "admin"]',
    },
    effect: {
      type: String,
      enum: ['allow', 'deny'],
      default: 'allow',
      required: true,
      description: 'Whether to allow or deny the action',
    },
    conditions: {
      type: [
        {
          field: String,
          operator: String,
          value: mongoose.Schema.Types.Mixed,
        },
      ],
      default: [],
      description: 'Array of conditions that must be met for the policy to apply',
    },
    enabled: {
      type: Boolean,
      default: true,
      description: 'Whether this policy is currently active',
    },
    priority: {
      type: Number,
      default: 0,
      description: 'Policy evaluation priority (higher = evaluated first)',
    },
    tags: {
      type: [String],
      default: [],
      description: 'Tags for organizing and searching policies',
    },
    createdBy: {
      type: String,
      description: 'Admin user ID who created this policy',
    },
    lastModifiedBy: {
      type: String,
      description: 'Admin user ID who last modified this policy',
    },
  },
  {
    timestamps: true,
    collection: 'policies',
  }
);

// Indexes for performance
policySchema.index({ actions: 1, enabled: 1 });
policySchema.index({ roles: 1, enabled: 1 });
policySchema.index({ tags: 1 });
policySchema.index({ createdAt: -1 });

const Policy = mongoose.model('Policy', policySchema);

class PolicyRepository {
  /**
   * Create a new policy
   * @param {object} policyData - Policy details
   * @returns {Promise<object>} - Created policy document
   */
  async create(policyData) {
    try {
      const policy = new Policy(policyData);
      const saved = await policy.save();
      logger.info(`Policy created: ${saved.name} (ID: ${saved._id})`);
      return saved.toObject();
    } catch (error) {
      if (error.code === 11000) {
        throw new Error(`Policy with name "${policyData.name}" already exists`);
      }
      throw error;
    }
  }

  /**
   * Find all policies for a given action
   * @param {string} action - Action name
   * @returns {Promise<array>} - Array of policies
   */
  async findByAction(action) {
    try {
      const policies = await Policy.find({
        actions: action,
        enabled: true,
      }).sort({ priority: -1, createdAt: 1 }).lean();

      return policies;
    } catch (error) {
      logger.error(`Error finding policies for action ${action}:`, error.message);
      return [];
    }
  }

  /**
   * Find all policies for a given role
   * @param {string} role - Role name
   * @returns {Promise<array>} - Array of policies
   */
  async findByRole(role) {
    try {
      const policies = await Policy.find({
        $or: [{ roles: { $size: 0 } }, { roles: role }],
        enabled: true,
      }).sort({ priority: -1 }).lean();

      return policies;
    } catch (error) {
      logger.error(`Error finding policies for role ${role}:`, error.message);
      return [];
    }
  }

  /**
   * Find policy by ID
   * @param {string} id - Policy ID
   * @returns {Promise<object|null>} - Policy document or null
   */
  async findById(id) {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
      }
      const policy = await Policy.findById(id).lean();
      return policy;
    } catch (error) {
      logger.error(`Error finding policy ${id}:`, error.message);
      return null;
    }
  }

  /**
   * Find all policies (with optional filtering)
   * @param {object} filters - Filter options {tags, roles, actions, enabled}
   * @returns {Promise<array>} - Array of policies
   */
  async findAll(filters = {}) {
    try {
      const query = {};

      if (filters.tags && filters.tags.length > 0) {
        query.tags = { $in: filters.tags };
      }

      if (filters.roles && filters.roles.length > 0) {
        query.roles = { $in: filters.roles };
      }

      if (filters.actions && filters.actions.length > 0) {
        query.actions = { $in: filters.actions };
      }

      if (filters.enabled !== undefined) {
        query.enabled = filters.enabled;
      }

      const policies = await Policy.find(query)
        .sort({ priority: -1, createdAt: -1 })
        .lean();

      return policies;
    } catch (error) {
      logger.error(`Error finding policies:`, error.message);
      return [];
    }
  }

  /**
   * Update a policy
   * @param {string} id - Policy ID
   * @param {object} updateData - Fields to update
   * @returns {Promise<object|null>} - Updated policy or null
   */
  async update(id, updateData) {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid policy ID');
      }

      const policy = await Policy.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });

      if (policy) {
        logger.info(`Policy updated: ${policy.name} (ID: ${policy._id})`);
      }

      return policy ? policy.toObject() : null;
    } catch (error) {
      logger.error(`Error updating policy ${id}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete a policy
   * @param {string} id - Policy ID
   * @returns {Promise<boolean>} - true if deleted, false if not found
   */
  async delete(id) {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid policy ID');
      }

      const result = await Policy.findByIdAndDelete(id);

      if (result) {
        logger.info(`Policy deleted: ${result.name} (ID: ${result._id})`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error deleting policy ${id}:`, error.message);
      throw error;
    }
  }

  /**
   * Count policies matching criteria
   * @param {object} filters - Filter options
   * @returns {Promise<number>} - Number of matching policies
   */
  async count(filters = {}) {
    try {
      const query = {};

      if (filters.enabled !== undefined) {
        query.enabled = filters.enabled;
      }

      if (filters.tags && filters.tags.length > 0) {
        query.tags = { $in: filters.tags };
      }

      return await Policy.countDocuments(query);
    } catch (error) {
      logger.error(`Error counting policies:`, error.message);
      return 0;
    }
  }

  /**
   * Populate default policies into database
   * @param {array} defaultPolicies - Array of default policy definitions
   * @returns {Promise<void>}
   */
  async seedDefaultPolicies(defaultPolicies) {
    try {
      const existingCount = await Policy.countDocuments();

      if (existingCount > 0) {
        logger.info(`Database already has ${existingCount} policies, skipping seed`);
        return;
      }

      const inserted = await Policy.insertMany(defaultPolicies);
      logger.info(`Seeded ${inserted.length} default policies`);
    } catch (error) {
      logger.error(`Error seeding default policies:`, error.message);
      throw error;
    }
  }

  /**
   * Enable a policy
   * @param {string} id - Policy ID
   * @returns {Promise<object|null>} - Updated policy
   */
  async enable(id) {
    return this.update(id, { enabled: true });
  }

  /**
   * Disable a policy
   * @param {string} id - Policy ID
   * @returns {Promise<object|null>} - Updated policy
   */
  async disable(id) {
    return this.update(id, { enabled: false });
  }
}

export default PolicyRepository;
export { Policy, policySchema };

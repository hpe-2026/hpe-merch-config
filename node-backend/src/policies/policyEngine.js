/**
 * NITTE Policy Engine
 * 
 * Evaluates role-based access control (RBAC) policies against request context.
 * Policies define what actions can be performed on resources by specific roles.
 */

import logger from '../config/logger.js';

class PolicyEngine {
  constructor(policyRepository) {
    this.policyRepository = policyRepository;
    this.cache = new Map(); // Simple in-memory cache for policies
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Evaluate if a request should be allowed based on policies
   * @param {string} action - Action name (e.g., 'list_products', 'checkout', 'manage_policies')
   * @param {object} context - Request context with user info and resource details
   * @returns {Promise<boolean>} - true if allowed, false if denied
   */
  async evaluate(action, context = {}) {
    try {
      const { userId, role = 'guest', resource, resourceId } = context;

      logger.debug(`Policy evaluation: action=${action}, role=${role}, resource=${resource}`);

      // Get applicable policies
      const policies = await this.getPoliciesForAction(action);

      if (!policies || policies.length === 0) {
        logger.warn(`No policies defined for action: ${action}`);
        return false; // Default deny if no policies defined
      }

      // Evaluate policies in order (effect: allow overrides deny by default)
      let allowed = false;

      for (const policy of policies) {
        if (!policy.enabled) continue;

        // Check if policy applies to this role
        if (!this.roleMatches(policy, role)) continue;

        // Evaluate policy conditions
        if (!this.evaluateConditions(policy, context)) continue;

        // Policy matches and conditions pass
        if (policy.effect === 'allow') {
          allowed = true;
          logger.debug(`Policy allowed: ${policy.name}`);
          break; // Allow overrides everything
        } else if (policy.effect === 'deny') {
          logger.debug(`Policy denied: ${policy.name}`);
          return false; // Deny is final
        }
      }

      return allowed;
    } catch (error) {
      logger.error(`Policy evaluation error: ${error.message}`);
      return false; // Fail secure
    }
  }

  /**
   * Get policies applicable to an action
   * @param {string} action - Action name
   * @returns {Promise<array>} - Array of policy documents
   */
  async getPoliciesForAction(action) {
    // Check cache first
    const cached = this.cache.get(action);
    if (cached && cached.expiry > Date.now()) {
      return cached.policies;
    }

    // Load from repository
    const policies = await this.policyRepository.findByAction(action);

    // Cache result
    this.cache.set(action, {
      policies,
      expiry: Date.now() + this.cacheExpiry,
    });

    return policies;
  }

  /**
   * Check if policy applies to a given role
   * @param {object} policy - Policy document
   * @param {string} role - User role
   * @returns {boolean}
   */
  roleMatches(policy, role) {
    if (!policy.roles || policy.roles.length === 0) {
      return true; // No role restriction = applies to all
    }
    return policy.roles.includes(role);
  }

  /**
   * Evaluate policy conditions against context
   * @param {object} policy - Policy document with conditions
   * @param {object} context - Request context
   * @returns {boolean}
   */
  evaluateConditions(policy, context) {
    if (!policy.conditions || policy.conditions.length === 0) {
      return true; // No conditions = always matches
    }

    // All conditions must match (AND logic)
    return policy.conditions.every((condition) => {
      return this.evaluateCondition(condition, context);
    });
  }

  /**
   * Evaluate a single condition
   * @param {object} condition - Condition with operator and values
   * @param {object} context - Request context
   * @returns {boolean}
   */
  evaluateCondition(condition, context) {
    const { field, operator, value } = condition;

    // Extract field value from context (supports nested paths: user.id)
    const contextValue = this.getNestedValue(context, field);

    if (contextValue === undefined) {
      logger.debug(`Condition field not found in context: ${field}`);
      return false;
    }

    // Evaluate based on operator
    switch (operator) {
      case 'equals':
      case 'eq':
        return contextValue === value;

      case 'notEquals':
      case 'ne':
        return contextValue !== value;

      case 'in':
        return Array.isArray(value) && value.includes(contextValue);

      case 'notIn':
        return Array.isArray(value) && !value.includes(contextValue);

      case 'contains':
        return String(contextValue).includes(String(value));

      case 'startsWith':
        return String(contextValue).startsWith(String(value));

      case 'endsWith':
        return String(contextValue).endsWith(String(value));

      case 'greaterThan':
      case 'gt':
        return Number(contextValue) > Number(value);

      case 'greaterThanOrEqual':
      case 'gte':
        return Number(contextValue) >= Number(value);

      case 'lessThan':
      case 'lt':
        return Number(contextValue) < Number(value);

      case 'lessThanOrEqual':
      case 'lte':
        return Number(contextValue) <= Number(value);

      case 'exists':
        return value ? contextValue !== undefined && contextValue !== null : contextValue === undefined || contextValue === null;

      case 'regex':
        return new RegExp(value).test(String(contextValue));

      default:
        logger.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }

  /**
   * Get nested value from object using dot notation
   * @param {object} obj - Object to traverse
   * @param {string} path - Dot-notation path (e.g., 'user.id')
   * @returns {any} - Value at path or undefined
   */
  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Add a policy dynamically (for testing/admin)
   * @param {object} policy - Policy document
   */
  async addPolicy(policy) {
    const saved = await this.policyRepository.create(policy);
    this.clearActionCache(policy.actions || []);
    return saved;
  }

  /**
   * Clear cache for specific actions
   * @param {string[]} actions - Action names to clear
   */
  clearActionCache(actions) {
    if (Array.isArray(actions)) {
      actions.forEach((action) => this.cache.delete(action));
    } else {
      this.cache.delete(actions);
    }
  }

  /**
   * Clear all cached policies
   */
  clearAllCache() {
    this.cache.clear();
  }
}

export default PolicyEngine;

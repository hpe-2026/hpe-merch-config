/**
 * Kafka Event Schemas
 * Define typed structures for all Kafka events in the system
 */

/**
 * Event: User Registration
 * Topic: unverified-users
 * Published when: A new user registers via /api/v1/auth/register
 */
export const UnverifiedUserEvent = {
  user_id: String,          // MongoDB ObjectId or Keycloak subject ID
  email: String,            // User email
  name: String,             // User full name
  alumni_id: String,        // Alumni ID from registration
  registration_timestamp: String, // ISO 8601 timestamp
  correlation_id: String,   // UUID for request tracing
  timestamp: String,        // ISO 8601 event timestamp
};

/**
 * Event: User Approved by Admin
 * Topic: user-approved
 * Published when: Admin approves a user via POST /api/v1/admin/users/:id/approve
 */
export const UserApprovedEvent = {
  user_id: String,          // User ID
  email: String,            // User email
  approved_by: String,      // Admin email or name who approved
  approval_reason: String,  // Why the user was approved
  correlation_id: String,   // UUID for request tracing
  timestamp: String,        // ISO 8601 event timestamp
};

/**
 * Event: User Rejected by Admin
 * Topic: user-rejected
 * Published when: Admin rejects a user via POST /api/v1/admin/users/:id/reject
 */
export const UserRejectedEvent = {
  user_id: String,          // User ID
  email: String,            // User email
  rejected_by: String,      // Admin email or name who rejected
  rejection_reason: String, // Why the user was rejected
  correlation_id: String,   // UUID for request tracing
  timestamp: String,        // ISO 8601 event timestamp
};

/**
 * Helper to validate event payload against schema
 * @param {object} event - Event payload
 * @param {object} schema - Expected schema definition
 * @returns {object} - Validation result with isValid and errors
 */
export function validateEventSchema(event, schema) {
  const errors = [];
  const isValid = Object.entries(schema).every(([key, type]) => {
    if (!(key in event)) {
      errors.push(`Missing required field: ${key}`);
      return false;
    }
    if (typeof event[key] !== type.name.toLowerCase()) {
      errors.push(
        `Invalid type for ${key}: expected ${type.name}, got ${typeof event[key]}`
      );
      return false;
    }
    return true;
  });

  return {
    isValid,
    errors,
    event,
  };
}

/**
 * Event message wrapper for Kafka
 * All events should follow this structure
 */
export const KafkaEventMessage = {
  event_type: String,       // 'user:registered', 'user:approved', 'user:rejected'
  correlation_id: String,   // Unique ID to trace request flow
  timestamp: String,        // ISO 8601 when event occurred
  source_service: String,   // 'api-gateway', 'notification-service', etc.
  payload: Object,          // Event-specific data (UnverifiedUserEvent, etc.)
};

/**
 * Topic definitions
 */
export const KAFKA_TOPICS = {
  UNVERIFIED_USERS: 'unverified-users',
  USER_APPROVED: 'user-approved',
  USER_REJECTED: 'user-rejected',
};

/**
 * Event type constants
 */
export const KAFKA_EVENT_TYPES = {
  USER_REGISTERED: 'user:registered',
  USER_APPROVED: 'user:approved',
  USER_REJECTED: 'user:rejected',
  NOTIFICATION_SENT: 'notification:sent',
};

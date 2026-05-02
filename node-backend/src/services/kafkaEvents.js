/**
 * Kafka Event Schemas
 * Defines the structure of messages published to Kafka topics
 */

export const KAFKA_TOPICS = {
  USER_EVENTS: 'user-events',
  PRODUCT_EVENTS: 'product-events',
  ORDER_EVENTS: 'order-events',
  NOTIFICATION_EVENTS: 'notification-events',
};

export const USER_EVENTS = {
  REGISTERED: 'user.registered',
  APPROVED: 'user.approved',
  REJECTED: 'user.rejected',
  PROFILE_UPDATED: 'user.profile.updated',
  PASSWORD_CHANGED: 'user.password.changed',
  ACCOUNT_DELETED: 'user.account.deleted',
};

export const PRODUCT_EVENTS = {
  CREATED: 'product.created',
  UPDATED: 'product.updated',
  DELETED: 'product.deleted',
  STOCK_CHANGED: 'product.stock.changed',
};

export const ORDER_EVENTS = {
  CREATED: 'order.created',
  PAYMENT_RECEIVED: 'order.payment.received',
  FULFILLED: 'order.fulfilled',
  CANCELLED: 'order.cancelled',
  SHIPPED: 'order.shipped',
};

export const NOTIFICATION_EVENTS = {
  EMAIL_SENT: 'notification.email.sent',
  SMS_SENT: 'notification.sms.sent',
  PUSH_SENT: 'notification.push.sent',
  FAILED: 'notification.failed',
};

/**
 * Event schemas
 */

export const userRegisteredEventSchema = {
  _id: String,
  email: String,
  name: String,
  alumni_id: String,
  registration_timestamp: Date,
  ip_address: String,
  user_agent: String,
};

export const userApprovedEventSchema = {
  userId: String,
  email: String,
  name: String,
  approval_reason: String,
  approved_by: String,
  approval_timestamp: Date,
};

export const userRejectedEventSchema = {
  userId: String,
  email: String,
  name: String,
  rejection_reason: String,
  rejected_by: String,
  rejection_timestamp: Date,
};

export const productCreatedEventSchema = {
  productId: String,
  name: String,
  price: Number,
  category: String,
  created_by: String,
  created_at: Date,
};

export const orderCreatedEventSchema = {
  orderId: String,
  userId: String,
  items: Array,
  total_amount: Number,
  order_status: String,
  created_at: Date,
};

export const orderPaymentReceivedEventSchema = {
  orderId: String,
  userId: String,
  amount: Number,
  payment_method: String,
  transaction_id: String,
  payment_timestamp: Date,
};

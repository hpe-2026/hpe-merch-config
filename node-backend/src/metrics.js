import client from 'prom-client';

const register = new client.Registry();

// Default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const activeConnections = new client.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register],
});

const authAttempts = new client.Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['type', 'success'],
  registers: [register],
});

const ordersCreated = new client.Counter({
  name: 'orders_created_total',
  help: 'Total number of orders created',
  registers: [register],
});

const productsViewed = new client.Counter({
  name: 'products_viewed_total',
  help: 'Total number of product views',
  registers: [register],
});

const databaseOperations = new client.Counter({
  name: 'database_operations_total',
  help: 'Total number of database operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

const apiErrors = new client.Counter({
  name: 'api_errors_total',
  help: 'Total number of API errors',
  labelNames: ['endpoint', 'error_code'],
  registers: [register],
});

const userRegistrationsTotal = new client.Counter({
  name: 'user_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['status'],
  registers: [register],
});

const orderValueTotal = new client.Counter({
  name: 'order_value_total',
  help: 'Cumulative order value in rupees',
  registers: [register],
});

const activeUsers = new client.Gauge({
  name: 'active_users',
  help: 'Number of users with valid sessions in the last 5 minutes',
  registers: [register],
});

export {
  register,
  httpRequestDuration,
  httpRequestsTotal,
  activeConnections,
  authAttempts,
  ordersCreated,
  productsViewed,
  databaseOperations,
  apiErrors,
  userRegistrationsTotal,
  orderValueTotal,
  activeUsers,
};

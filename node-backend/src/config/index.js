import dotenv from 'dotenv';

dotenv.config();

const config = {
  node_env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  python_service_url: process.env.PYTHON_SERVICE_URL || 'http://localhost:8000',
  jwt_secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
  jwt_expiry: process.env.JWT_EXPIRY || '7d',
  mongodb_url: process.env.MONGODB_URL || 'mongodb://localhost:27017/nitte_merch_shop',
  log_level: process.env.LOG_LEVEL || 'info',
  cors_origins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5175'
  ],
  request_timeout: process.env.REQUEST_TIMEOUT || 30000,
  keycloak: {
    server_url: process.env.KEYCLOAK_SERVER_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'nitte-realm',
    client_id: process.env.KEYCLOAK_CLIENT_ID || 'nitte-client',
    client_secret: process.env.KEYCLOAK_CLIENT_SECRET || 'nitte-client-secret',
  },
};

export default config;

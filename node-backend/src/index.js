import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import { connectDatabase } from './config/database.js';
import logger from './config/logger.js';
import {
  authMiddleware,
  errorHandler,
  requestLogger,
  addGatewayHeaders,
  attachUserAttributes,
} from './middleware/index.js';
import pythonServiceClient from './services/pythonServiceClient.js';
import {
  register,
  httpRequestDuration,
  httpRequestsTotal,
  activeConnections,
} from './metrics.js';
import tracer, { trace, context, propagation, otelApi, sdk } from './tracing.js';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Policy system imports
import PolicyEngine from './policies/policyEngine.js';
import PolicyRepository from './policies/policyRepository.js';
import defaultPolicies from './policies/defaultPolicies.js';
import { createAdminPolicyRoutes } from './routes/adminPolicies.js';

// Kafka event bus
import kafkaProducer from './services/kafkaProducer.js';

// Debug tracer initialization
logger.info('nitte-api-gateway tracer module loaded with spans enabled');

// Import routes
import authRoutes from './routes/auth.js';
import authSimple from './routes/authSimple.js';
import adminUsersRoutes from './routes/adminUsers.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import metricsRoutes from './routes/metrics.js';
import jaegerRoutes from './routes/jaeger.js';
import paymentsRoutes from './routes/payments.js';
import uploadRoutes from './routes/upload.js';
import merchantRoutes from './routes/merchants.js';

const app = express();

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  activeConnections.inc();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    
    httpRequestDuration.observe({
      method: req.method,
      route,
      status_code: res.statusCode,
    }, duration);

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });

    activeConnections.dec();
  });

  next();
});

// OpenTelemetry tracing middleware — creates a parent span for each request
// and runs the middleware chain within its context so child spans and baggage propagate
app.use((req, res, next) => {
  try {
    const parentContext = propagation.extract(context.active(), req.headers);
    const span = tracer.startSpan(`${req.method} ${req.path}`, {
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
      },
    }, parentContext);

    const requestContext = trace.setSpan(parentContext, span);
    req.otelSpan = span;

    res.on('finish', () => {
      if (span && typeof span.setAttribute === 'function') {
        span.setAttribute('http.status_code', res.statusCode);

        // Mark as error if status code indicates an error (4xx or 5xx)
        if (res.statusCode >= 400) {
          span.setStatus({ code: otelApi.SpanStatusCode.ERROR, message: res.statusMessage || 'Error' });
          span.setAttribute('error', true);
          span.setAttribute('error.kind', 'HTTP');
        }

        span.end();
      }
    });

    // Run the rest of the middleware chain within the request's OTel context
    // so that authMiddleware can attach identity to this span and child spans
    // created in route handlers are nested correctly.
    context.with(requestContext, next);
    return;
  } catch (err) {
    logger.debug('Tracing middleware error:', err.message);
  }

  next();
});

// Export tracer for use in other modules

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: config.cors_origins,
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // Raise limit significantly for demo/dev environment
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    // Skip rate limiting for localhost (development) and authenticated requests
    return req.ip === '::1' || req.ip === '127.0.0.1' || req.headers.authorization?.startsWith('Bearer admin-token-');
  }
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Logging middleware
app.use(requestLogger);

// Phase 3: API Gateway headers - adds X-User-ID, X-Roles, etc. to downstream requests
// This must come after auth but we apply it globally to catch all authenticated requests
app.use((req, res, next) => {
  // Defer gateway headers until after auth is resolved
  // We'll apply them in each route that uses authMiddleware
  next();
});

// Phase 4: Attach user attributes for ABAC checks
app.use(attachUserAttributes);

// Health check endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API Gateway is healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

app.get('/ping', (req, res) => {
  res.status(200).json({ status: 'pong' });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Service health check
app.get('/api/v1/service-health', async (req, res) => {
  try {
    const pythonServiceHealth = await pythonServiceClient.checkServiceHealth();
    res.status(200).json({
      success: true,
      services: {
        api_gateway: {
          status: 'up',
          timestamp: new Date(),
        },
        python_service: pythonServiceHealth,
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'One or more services are unavailable',
      services: {
        api_gateway: {
          status: 'up',
        },
        python_service: {
          status: 'down',
        },
      },
    });
  }
});

// OpenAPI Swagger UI setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openapiPath = path.join(__dirname, '../openapi/v1/openapi.yaml');

// Load and parse OpenAPI spec with component imports
const loadOpenAPISpec = () => {
  try {
    const specContent = fs.readFileSync(openapiPath, 'utf8');
    const baseSpec = YAML.parse(specContent);
    
    // Load and merge component files
    const schemasPath = path.join(__dirname, '../openapi/v1/schemas/schemas.yaml');
    const authPathsPath = path.join(__dirname, '../openapi/v1/paths/auth.yaml');
    const productsPathsPath = path.join(__dirname, '../openapi/v1/paths/products.yaml');
    const ordersPathsPath = path.join(__dirname, '../openapi/v1/paths/orders.yaml');
    const adminPathsPath = path.join(__dirname, '../openapi/v1/paths/admin.yaml');
    const adminUsersPathsPath = path.join(__dirname, '../openapi/v1/paths/admin_users.yaml');
    const errorsPath = path.join(__dirname, '../openapi/v1/responses/errors.yaml');
    
    // Load schemas
    if (fs.existsSync(schemasPath)) {
      const schemas = YAML.parse(fs.readFileSync(schemasPath, 'utf8'));
      if (!baseSpec.components) baseSpec.components = {};
      if (!baseSpec.components.schemas) baseSpec.components.schemas = {};
      baseSpec.components.schemas = { ...baseSpec.components.schemas, ...schemas.components?.schemas || schemas };
    }
    
    // Load error responses
    if (fs.existsSync(errorsPath)) {
      const errors = YAML.parse(fs.readFileSync(errorsPath, 'utf8'));
      if (!baseSpec.components) baseSpec.components = {};
      if (!baseSpec.components.responses) baseSpec.components.responses = {};
      baseSpec.components.responses = { ...baseSpec.components.responses, ...errors.components?.responses || errors };
    }
    
    // Load and merge path definitions
    if (fs.existsSync(authPathsPath)) {
      const authPaths = YAML.parse(fs.readFileSync(authPathsPath, 'utf8'));
      baseSpec.paths = { ...baseSpec.paths, ...authPaths.paths || authPaths };
    }
    if (fs.existsSync(productsPathsPath)) {
      const productsPaths = YAML.parse(fs.readFileSync(productsPathsPath, 'utf8'));
      baseSpec.paths = { ...baseSpec.paths, ...productsPaths.paths || productsPaths };
    }
    if (fs.existsSync(ordersPathsPath)) {
      const ordersPaths = YAML.parse(fs.readFileSync(ordersPathsPath, 'utf8'));
      baseSpec.paths = { ...baseSpec.paths, ...ordersPaths.paths || ordersPaths };
    }
    if (fs.existsSync(adminPathsPath)) {
      const adminPaths = YAML.parse(fs.readFileSync(adminPathsPath, 'utf8'));
      baseSpec.paths = { ...baseSpec.paths, ...adminPaths.paths || adminPaths };
    }
    if (fs.existsSync(adminUsersPathsPath)) {
      const adminUsersPaths = YAML.parse(fs.readFileSync(adminUsersPathsPath, 'utf8'));
      baseSpec.paths = { ...baseSpec.paths, ...adminUsersPaths.paths || adminUsersPaths };
    }
    
    logger.info('OpenAPI specification loaded successfully');
    return baseSpec;
  } catch (error) {
    logger.error('Failed to load OpenAPI specification:', error.message);
    return null;
  }
};

const openapiSpec = loadOpenAPISpec();

// Serve OpenAPI spec as JSON endpoint
app.get('/api/v1/openapi.json', (req, res) => {
  if (!openapiSpec) {
    return res.status(500).json({
      success: false,
      message: 'OpenAPI specification not available',
    });
  }
  res.json(openapiSpec);
});

// Mount Swagger UI at /api/docs
if (openapiSpec) {
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, {
      swaggerOptions: {
        urls: [
          {
            url: '/api/v1/openapi.json',
            name: 'API v1',
          },
        ],
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        showRequestHeaders: true,
        requestInterceptor: (request) => {
          // Automatically include token if present
          const token = localStorage?.getItem('auth_token');
          if (token) {
            request.headers.Authorization = `Bearer ${token}`;
          }
          return request;
        },
      },
      swaggerUiOptions: {
        swaggerUrl: '/api/v1/openapi.json',
      },
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'NITTE Merchandise Shop API Documentation',
    })
  );
  
  logger.info('Swagger UI mounted at /api/docs');
} else {
  logger.warn('OpenAPI specification not loaded, Swagger UI will not be available');
}

// API routes
console.log('[ROUTES] Mounting authSimple at /api/v1/auth');
app.use('/api/v1/auth', authSimple);  // Use simpler auth with MongoDB
console.log('[ROUTES] Mounting authRoutes at /api/v1/admin/auth');
app.use('/api/v1/admin/auth', authRoutes);  // Keycloak is admin-only
app.use('/api/v1/admin/users', adminUsersRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/metrics', metricsRoutes);
app.use('/api/v1/jaeger', jaegerRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/merchants', merchantRoutes);

// ============================ POLICY SYSTEM ============================
// Initialize RBAC policy engine
let policyEngine = null;
let policyRepository = null;

const initializePolicies = async () => {
  try {
    // Create policy repository
    policyRepository = new PolicyRepository();

    // Create policy engine
    policyEngine = new PolicyEngine(policyRepository);

    // Seed default policies on first run
    await policyRepository.seedDefaultPolicies(defaultPolicies);

    logger.info('RBAC policy system initialized successfully');

    // Mount admin policy routes
    const adminPolicyRoutes = createAdminPolicyRoutes(policyEngine, policyRepository);
    app.use('/api/v1/admin/policies', adminPolicyRoutes);

    logger.info('Admin policy endpoints mounted at /api/v1/admin/policies');

    return true;
  } catch (error) {
    logger.error(`Failed to initialize policy system: ${error.message}`);
    return false;
  }
};

// This will be called after database connection

// Health check endpoint under v1
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API Gateway is healthy',
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'NITTE Merchandise Shop API Gateway',
    version: '1.0.0',
    docs: 'https://api-docs.example.com',
  });
});

// NOTE: 404 and error handlers are registered in startServer() AFTER policy routes are mounted

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Initialize RBAC policy system
    await initializePolicies();

    // Initialize Kafka producer for event bus
    try {
      await kafkaProducer.initialize();
      logger.info('Kafka producer initialized successfully');
      // Make producer available globally via app.locals
      app.locals.kafkaProducer = kafkaProducer;
    } catch (kafkaError) {
      logger.error('Failed to initialize Kafka producer:', kafkaError.message);
      logger.warn('Continuing without Kafka - events will not be published');
      // Continue without Kafka - non-critical for operation
    }

    // Register 404 handler AFTER all routes are mounted (including policy routes)
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.path} not found`,
      });
    });

    // Error handling middleware
    app.use(errorHandler);

    // Start listening
    const server = app.listen(config.port, () => {
      logger.info(`API Gateway started on port ${config.port}`);
      logger.info(`Environment: ${config.node_env}`);
      logger.info(`Python Service URL: ${config.python_service_url}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(async () => {
        logger.info('Server closed');
        // Disconnect Kafka producer
        try {
          await kafkaProducer.disconnect();
        } catch (kafkaError) {
          logger.warn('Error disconnecting Kafka producer:', kafkaError.message);
        }
        // Flush remaining spans to Jaeger
        sdk.shutdown().then(() => {
          logger.info('OpenTelemetry SDK shut down');
          // await disconnectDatabase();
          process.exit(0);
        }).catch((err) => {
          logger.warn('OpenTelemetry shutdown error:', err.message);
          process.exit(0);
        });
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(async () => {
        logger.info('Server closed');
        // Disconnect Kafka producer
        try {
          await kafkaProducer.disconnect();
        } catch (kafkaError) {
          logger.warn('Error disconnecting Kafka producer:', kafkaError.message);
        }
        // Flush remaining spans to Jaeger
        sdk.shutdown().then(() => {
          logger.info('OpenTelemetry SDK shut down');
          // await disconnectDatabase();
          process.exit(0);
        }).catch((err) => {
          logger.warn('OpenTelemetry shutdown error:', err.message);
          process.exit(0);
        });
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

startServer();

export default app;

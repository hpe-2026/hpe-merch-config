import logger from './logger.js';
import emailService from './services/emailService.js';
import smsService from './services/smsService.js';
import keycloakEventHandler from './services/keycloakEventHandler.js';
import NotificationConsumer from './kafka/consumer.js';
import { startMetricsServer } from './metricsServer.js';

const consumer = new NotificationConsumer();

const METRICS_PORT = parseInt(process.env.METRICS_PORT || '9100', 10);
startMetricsServer({
  port: METRICS_PORT,
  getStatus: () => consumer.getStatus ? consumer.getStatus() : { connected: false },
});

/**
 * Main application startup
 */
async function start() {
  try {
    logger.info('');
    logger.info(' NITTE Notification Service Starting');
    logger.info('');

    // Initialize email service
    logger.info(' Initializing email service...');
    await emailService.initialize();
    logger.info(' Email service initialized');

    // Initialize SMS service
    logger.info(' Initializing SMS service...');
    await smsService.initialize();
    logger.info(' SMS service initialized');

    // Initialize Keycloak event handler
    logger.info(' Initializing Keycloak event handler...');
    await keycloakEventHandler.initialize();
    logger.info(' Keycloak event handler initialized');

    // Initialize Kafka consumer
    logger.info(' Initializing Kafka consumer...');
    await consumer.initialize();
    logger.info(' Kafka consumer initialized');

    // Start consuming messages
    logger.info(' Starting to listen for Kafka messages...');
    await consumer.startConsuming();

    logger.info('');
    logger.info(' Notification Service is running');
    logger.info('Status:', consumer.getStatus());
    logger.info('');

    // Graceful shutdown handlers
    process.on('SIGINT', async () => {
      logger.info(' SIGINT received - shutting down gracefully...');
      await gracefulShutdown();
    });

    process.on('SIGTERM', async () => {
      logger.info(' SIGTERM received - shutting down gracefully...');
      await gracefulShutdown();
    });

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Uncaught exception handler
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught Exception:', error);
      await gracefulShutdown();
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start notification service:', error.message);
    process.exit(1);
  }
}

/**
 * Graceful shutdown function
 */
async function gracefulShutdown() {
  try {
    logger.info(' Shutting down gracefully...');

    // Disconnect Kafka consumer
    if (consumer) {
      await consumer.disconnect();
    }

    // Disconnect email service
    if (emailService) {
      await emailService.disconnect();
    }

    logger.info(' Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error.message);
    process.exit(1);
  }
}

// Start the service
start();

export { consumer, emailService };

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const config = {
  // Kafka configuration
  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: process.env.KAFKA_CLIENT_ID || 'notification-service',
    consumerGroup: process.env.KAFKA_CONSUMER_GROUP || 'notification-service',
    topics: {
      userApproved: 'user-approved',
      userRejected: 'user-rejected',
      unverifiedUsers: 'unverified-users',
    },
    connectionTimeout: 3000,
    requestTimeout: 30000,
  },

  // Email configuration
  email: {
    enabled: process.env.EMAIL_ENABLED !== 'false',
    provider: process.env.EMAIL_PROVIDER || 'console', // 'console' or 'smtp'
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || 'noreply@nitte.com',
        pass: process.env.SMTP_PASS || '',
      },
      from: process.env.SMTP_FROM || 'noreply@nitte-merch-shop.com',
    },
  },

  // Service configuration
  service: {
    environment: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    retry: {
      enabled: true,
      attempts: 3,
      delayMs: 1000,
    },
  },
};

export default config;

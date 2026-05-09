import { Kafka } from 'kafkajs';
import config from '../config.js';
import logger from '../logger.js';
import emailService from '../services/emailService.js';
import smsService from '../services/smsService.js';
import { notificationsProcessed, notificationsLatency } from '../metricsServer.js';

class NotificationConsumer {
  constructor() {
    this.kafka = new Kafka({
      clientId: config.kafka.clientId,
      brokers: config.kafka.brokers,
      connectionTimeout: config.kafka.connectionTimeout,
      requestTimeout: config.kafka.requestTimeout,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    this.consumer = null;
    this.isConnected = false;
  }

  /**
   * Initialize Kafka consumer
   */
  async initialize() {
    try {
      this.consumer = this.kafka.consumer({
        groupId: config.kafka.consumerGroup,
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
      });

      await this.consumer.connect();
      this.isConnected = true;

      logger.info('Kafka consumer connected', {
        brokers: config.kafka.brokers.join(','),
        groupId: config.kafka.consumerGroup,
      });

      // Subscribe to topics
      await this.consumer.subscribe({
        topics: [
          config.kafka.topics.userApproved,
          config.kafka.topics.userRejected,
        ],
        fromBeginning: false,
      });

      logger.info('Subscribed to topics', {
        topics: [
          config.kafka.topics.userApproved,
          config.kafka.topics.userRejected,
        ],
      });
    } catch (error) {
      logger.error('Failed to initialize Kafka consumer:', error.message);
      throw error;
    }
  }

  /**
   * Start consuming messages
   */
  async startConsuming() {
    if (!this.isConnected) {
      throw new Error('Consumer not connected');
    }

    try {
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const endTimer = notificationsLatency.startTimer({ topic });
          try {
            const messageValue = message.value.toString('utf-8');
            const payload = JSON.parse(messageValue);

            // Extract persistent identity from Kafka headers for cross-service correlation
            const keycloakSubjectId = message.headers?.['keycloak-subject-id']?.toString('utf-8') || null;

            logger.info('Received message', {
              topic,
              partition,
              key: message.key?.toString('utf-8'),
              keycloakSubjectId,
            });

            // Route to appropriate handler
            if (topic === config.kafka.topics.userApproved) {
              await this.handleUserApproved(payload, keycloakSubjectId);
            } else if (topic === config.kafka.topics.userRejected) {
              await this.handleUserRejected(payload, keycloakSubjectId);
            }
            notificationsProcessed.inc({ topic, status: 'success' });
          } catch (error) {
            notificationsProcessed.inc({ topic, status: 'error' });
            logger.error('Error processing message:', error.message, {
              topic,
              partition,
            });
            // Don't re-throw - continue processing other messages
          } finally {
            endTimer();
          }
        },
      });

      logger.info('Started consuming Kafka messages');
    } catch (error) {
      logger.error('Error during message consumption:', error.message);
      throw error;
    }
  }

  /**
   * Handle user-approved event
   */
  async handleUserApproved(payload, keycloakSubjectId = null) {
    try {
      logger.info('Processing user approval notification', {
        user_id: payload.user_id,
        email: payload.email,
        keycloakSubjectId,
      });

      const user = {
        name: payload.name || 'Alumni',
        email: payload.email,
        alumni_id: payload.alumni_id,
      };

      // Send email notification
      const emailResult = await emailService.sendApprovalEmail(
        user,
        payload.approved_by || 'Admin',
        payload.approval_reason || 'Verified'
      );

      let smsResult = { success: false };
      // Send SMS notification if phone number provided
      if (payload.phone_number) {
        smsResult = await smsService.sendApprovalSMS(payload.phone_number, user.name);
      }

      logger.info('Approval notification sent', {
        user_id: payload.user_id,
        keycloakSubjectId,
        email: {
          sent: emailResult.success,
          method: emailResult.mode,
        },
        sms: {
          sent: smsResult.success,
          method: smsResult.mode,
        },
      });
    } catch (error) {
      logger.error('Error handling user approval:', error.message, {
        payload,
        keycloakSubjectId,
      });
      throw error;
    }
  }

  /**
   * Handle user-rejected event
   */
  async handleUserRejected(payload, keycloakSubjectId = null) {
    try {
      logger.info('Processing user rejection notification', {
        user_id: payload.user_id,
        email: payload.email,
        keycloakSubjectId,
      });

      const user = {
        name: payload.name || 'Alumni',
        email: payload.email,
        alumni_id: payload.alumni_id,
      };

      // Send email notification
      const emailResult = await emailService.sendRejectionEmail(
        user,
        payload.rejected_by || 'Admin',
        payload.rejection_reason || 'Not verified'
      );

      let smsResult = { success: false };
      // Send SMS notification if phone number provided
      if (payload.phone_number) {
        smsResult = await smsService.sendRejectionSMS(
          payload.phone_number,
          user.name,
          payload.rejection_reason || 'Not verified'
        );
      }

      logger.info('Rejection notification sent', {
        user_id: payload.user_id,
        keycloakSubjectId,
        email: {
          sent: emailResult.success,
          method: emailResult.mode,
        },
        sms: {
          sent: smsResult.success,
          method: smsResult.mode,
        },
      });
    } catch (error) {
      logger.error('Error handling user rejection:', error.message, {
        payload,
        keycloakSubjectId,
      });
      throw error;
    }
  }

  /**
   * Disconnect consumer
   */
  async disconnect() {
    if (this.consumer && this.isConnected) {
      try {
        await this.consumer.disconnect();
        this.isConnected = false;
        logger.info('Kafka consumer disconnected');
      } catch (error) {
        logger.error('Error disconnecting consumer:', error.message);
      }
    }
  }

  /**
   * Get consumer status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      topics: [
        config.kafka.topics.userApproved,
        config.kafka.topics.userRejected,
      ],
      consumerGroup: config.kafka.consumerGroup,
    };
  }
}

export default NotificationConsumer;

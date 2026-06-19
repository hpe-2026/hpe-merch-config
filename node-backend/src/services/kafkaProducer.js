import { Kafka } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';
import { getKeycloakSubjectFromBaggage } from '../tracing.js';

class KafkaProducer {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'nitte-api-gateway',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: {
        initialRetryTime: 100,
        retries: 8,
        randomizationFactor: 0.2,
      },
      connectionTimeout: 3000,
      requestTimeout: 30000,
    });

    this.producer = null;
    this.isConnected = false;
  }

  /**
   * Initialize Kafka producer and create topics if they don't exist
   */
  async initialize() {
    try {
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true,
        idempotent: true,
        maxInFlightRequests: 1,
        transactionTimeout: 30000,
      });

      await this.producer.connect();
      this.isConnected = true;

      logger.info('Kafka Producer connected successfully');

      // Create topics
      await this.createTopics();
    } catch (error) {
      logger.error('Failed to initialize Kafka Producer:', error);
      throw error;
    }
  }

  /**
   * Create Kafka topics if they don't exist
   */
  async createTopics() {
    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const topics = [
        {
          topic: 'unverified-users',
          numPartitions: 1,
          replicationFactor: 1,
          configEntries: [
            { name: 'retention.ms', value: '604800000' }, // 7 days
          ],
        },
        {
          topic: 'user-approved',
          numPartitions: 1,
          replicationFactor: 1,
          configEntries: [
            { name: 'retention.ms', value: '2592000000' }, // 30 days
          ],
        },
        {
          topic: 'user-rejected',
          numPartitions: 1,
          replicationFactor: 1,
          configEntries: [
            { name: 'retention.ms', value: '2592000000' }, // 30 days
          ],
        },
        {
          topic: 'order-events',
          numPartitions: 1,
          replicationFactor: 1,
          configEntries: [
            { name: 'retention.ms', value: '2592000000' }, // 30 days
          ],
        },
        {
          topic: 'product-events',
          numPartitions: 1,
          replicationFactor: 1,
          configEntries: [
            { name: 'retention.ms', value: '2592000000' }, // 30 days
          ],
        },
        {
          topic: 'user-activity',
          numPartitions: 1,
          replicationFactor: 1,
          configEntries: [
            { name: 'retention.ms', value: '604800000' }, // 7 days
          ],
        },
      ];

      await admin.createTopics({
        topics,
        validateOnly: false,
        timeout: 30000,
      });

      logger.info('Kafka topics created/verified successfully');

      await admin.disconnect();
    } catch (error) {
      if (error.type === 'TOPIC_ALREADY_EXISTS') {
        logger.info('Topics already exist, skipping creation');
      } else {
        logger.warn('Error creating topics:', error.message);
        // Don't throw - topics might be managed externally
      }
    }
  }

  /**
   * Publish an event to Kafka
   * @param {string} topic - Topic name
   * @param {object} message - Message payload
   * @param {string} eventType - Type of event (for logging)
   * @returns {Promise<void>}
   */
  async publishEvent(topic, message, eventType = 'event') {
    if (!this.isConnected) {
      logger.warn(`Kafka not connected, cannot publish ${eventType} to ${topic}`);
      // Optionally queue for later or throw
      return;
    }

    try {
      const keycloakSubjectId = getKeycloakSubjectFromBaggage();
      const kafkaMessage = {
        key: message.user_id || message.email || null,
        value: JSON.stringify({
          ...message,
          correlation_id: message.correlation_id || uuidv4(),
          timestamp: message.timestamp || new Date().toISOString(),
        }),
        headers: {
          'event-type': eventType,
          'timestamp': new Date().toISOString(),
          ...(keycloakSubjectId && { 'keycloak-subject-id': keycloakSubjectId }),
        },
      };

      await this.producer.send({
        topic,
        messages: [kafkaMessage],
        timeout: 10000,
        acks: -1, // Wait for all replicas
      });

      logger.info(`Published ${eventType} to topic ${topic}`, {
        messageKey: kafkaMessage.key,
        eventType,
      });
    } catch (error) {
      logger.error(`Failed to publish ${eventType} to topic ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Publish user registration event
   */
  async publishUserRegistrationEvent(user) {
    const payload = {
      user_id: user._id?.toString() || user.id,
      email: user.email,
      name: user.name,
      alumni_id: user.alumni_id,
      registration_timestamp: new Date().toISOString(),
    };

    await this.publishEvent('unverified-users', payload, 'user:registered');
  }

  /**
   * Publish user approved event
   */
  async publishUserApprovedEvent(userId, email, approvers, approvalReason = '') {
    const payload = {
      user_id: userId,
      email,
      approved_by: approvers,
      approval_reason: approvalReason,
    };

    await this.publishEvent('user-approved', payload, 'user:approved');
  }

  /**
   * Publish user rejected event
   */
  async publishUserRejectedEvent(userId, email, rejectedBy, rejectionReason = '') {
    const payload = {
      user_id: userId,
      email,
      rejected_by: rejectedBy,
      rejection_reason: rejectionReason,
    };

    await this.publishEvent('user-rejected', payload, 'user:rejected');
  }

  /**
   * Publish order created event
   */
  async publishOrderCreatedEvent(order) {
    const payload = {
      order_id: order.order_id || order._id,
      user_id: order.user_id,
      user_email: order.user_email,
      items: order.items,
      shipping_address: order.shipping_address,
      status: order.status || 'pending',
      total_amount: order.items?.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0) || 0,
      created_at: order.created_at || new Date().toISOString(),
    };

    await this.publishEvent('order-events', payload, 'order:created');
  }

  /**
   * Publish order updated event (status change)
   */
  async publishOrderUpdatedEvent(orderId, updateData, userEmail) {
    const payload = {
      order_id: orderId,
      user_email: userEmail,
      status: updateData.status,
      notes: updateData.notes,
      updated_at: new Date().toISOString(),
    };

    await this.publishEvent('order-events', payload, 'order:updated');
  }

  /**
   * Publish product created event
   */
  async publishProductCreatedEvent(product, creatorEmail) {
    const payload = {
      product_id: product._id || product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
      created_by: creatorEmail,
      created_at: new Date().toISOString(),
    };

    await this.publishEvent('product-events', payload, 'product:created');
  }

  /**
   * Publish product updated event
   */
  async publishProductUpdatedEvent(productId, updateData, updaterEmail) {
    const payload = {
      product_id: productId,
      updates: updateData,
      updated_by: updaterEmail,
      updated_at: new Date().toISOString(),
    };

    await this.publishEvent('product-events', payload, 'product:updated');
  }

  /**
   * Publish product deleted event
   */
  async publishProductDeletedEvent(productId, deleterEmail) {
    const payload = {
      product_id: productId,
      deleted_by: deleterEmail,
      deleted_at: new Date().toISOString(),
    };

    await this.publishEvent('product-events', payload, 'product:deleted');
  }

  /**
   * Publish user login event
   */
  async publishUserLoginEvent(email, method = 'local') {
    const payload = {
      email,
      login_method: method,
      logged_in_at: new Date().toISOString(),
    };

    await this.publishEvent('user-activity', payload, 'user:login');
  }

  /**
   * Publish user signup event
   */
  async publishUserSignupEvent(user) {
    const payload = {
      user_id: user._id?.toString() || user.id,
      email: user.email,
      name: user.name,
      user_type: user.user_type || 'alumni',
      registered_at: new Date().toISOString(),
    };

    await this.publishEvent('user-activity', payload, 'user:signup');
  }

  /**
   * Publish email verification event (sends verification link to user)
   */
  async publishEmailVerificationEvent(email, name, verificationToken) {
    const payload = {
      email,
      name,
      verification_token: verificationToken,
      sent_at: new Date().toISOString(),
    };

    await this.publishEvent('user-activity', payload, 'user:email-verification');
  }

  /**
   * Publish email confirmed event (user clicked the verification link)
   */
  async publishEmailConfirmedEvent(email, name) {
    const payload = {
      email,
      name,
      confirmed_at: new Date().toISOString(),
    };

    await this.publishEvent('user-activity', payload, 'user:email-confirmed');
  }

  /**
   * Disconnect producer
   */
  async disconnect() {
    if (this.producer && this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      logger.info('Kafka Producer disconnected');
    }
  }
}

// Create and export singleton instance
const kafkaProducer = new KafkaProducer();

export default kafkaProducer;

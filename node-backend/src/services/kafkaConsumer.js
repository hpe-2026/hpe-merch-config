import { Kafka } from 'kafkajs';
import logger from '../config/logger.js';

/**
 * Base class for Kafka consumers
 * Provides common initialization, connection management, and error handling
 */
class KafkaConsumerService {
  constructor(consumerGroupId, topics = []) {
    this.kafka = new Kafka({
      clientId: consumerGroupId,
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
      connectionTimeout: 3000,
      requestTimeout: 30000,
    });

    this.consumerGroupId = consumerGroupId;
    this.topics = topics;
    this.consumer = null;
    this.isConnected = false;
    this.messageHandlers = {};
  }

  /**
   * Initialize and start consuming messages
   */
  async initialize() {
    try {
      this.consumer = this.kafka.consumer({
        groupId: this.consumerGroupId,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
        allowAutoTopicCreation: false,
        retry: {
          initialRetryTime: 100,
          retries: 5,
        },
      });

      await this.consumer.connect();
      this.isConnected = true;

      logger.info(`Kafka Consumer [${this.consumerGroupId}] connected`);

      // Subscribe to topics
      if (this.topics.length > 0) {
        await this.consumer.subscribe({
          topics: this.topics,
          fromBeginning: false,
        });

        logger.info(`Kafka Consumer subscribed to topics:`, this.topics);
      }
    } catch (error) {
      logger.error(
        `Failed to initialize Kafka Consumer [${this.consumerGroupId}]:`,
        error
      );
      throw error;
    }
  }

  /**
   * Start consuming messages
   * Subclasses should override this method
   */
  async startConsuming() {
    if (!this.consumer || !this.isConnected) {
      throw new Error('Consumer not initialized. Call initialize() first.');
    }

    try {
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const parsedMessage = JSON.parse(message.value.toString());
            const eventType = message.headers['event-type']?.toString();

            logger.info(
              `Received message from topic [${topic}] partition [${partition}]`,
              {
                eventType,
                correlationId: parsedMessage.correlation_id,
              }
            );

            // Call handler if registered
            if (this.messageHandlers[topic]) {
              await this.messageHandlers[topic](parsedMessage, {
                topic,
                partition,
                offset: message.offset,
                key: message.key?.toString(),
                eventType,
              });
            }
          } catch (error) {
            logger.error(`Error processing message from topic [${topic}]:`, error);
            // Continue processing other messages
          }
        },
      });

      logger.info(`Kafka Consumer [${this.consumerGroupId}] started consuming`);
    } catch (error) {
      logger.error(
        `Error in Kafka Consumer [${this.consumerGroupId}] consuming:`,
        error
      );
      throw error;
    }
  }

  /**
   * Register a handler for a specific topic
   */
  registerHandler(topic, handler) {
    if (typeof handler !== 'function') {
      throw new Error(`Handler must be a function for topic [${topic}]`);
    }
    this.messageHandlers[topic] = handler;
    logger.info(`Registered handler for topic [${topic}]`);
  }

  /**
   * Disconnect consumer
   */
  async disconnect() {
    if (this.consumer && this.isConnected) {
      await this.consumer.disconnect();
      this.isConnected = false;
      logger.info(`Kafka Consumer [${this.consumerGroupId}] disconnected`);
    }
  }

  /**
   * Get consumer group info
   */
  async getGroupInfo() {
    if (!this.consumer) {
      throw new Error('Consumer not initialized');
    }

    try {
      const admin = this.kafka.admin();
      await admin.connect();

      const groups = await admin.describeGroups([this.consumerGroupId]);
      const offsets = await admin.fetchOffsets(this.consumerGroupId);

      await admin.disconnect();

      return {
        groupId: this.consumerGroupId,
        groups: groups.groups,
        offsets: offsets,
      };
    } catch (error) {
      logger.error('Error getting group info:', error);
      throw error;
    }
  }
}

export default KafkaConsumerService;

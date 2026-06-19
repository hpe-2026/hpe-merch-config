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

      // Subscribe to all topics
      const topics = [
        config.kafka.topics.userApproved,
        config.kafka.topics.userRejected,
        config.kafka.topics.orderEvents,
        config.kafka.topics.productEvents,
        config.kafka.topics.userActivity,
      ];

      await this.consumer.subscribe({
        topics,
        fromBeginning: false,
      });

      logger.info('Subscribed to topics', { topics });
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

            // Extract event type from headers
            const eventType = message.headers?.['event-type']?.toString('utf-8') || 'unknown';
            const keycloakSubjectId = message.headers?.['keycloak-subject-id']?.toString('utf-8') || null;

            logger.info('Received message', {
              topic,
              partition,
              eventType,
              key: message.key?.toString('utf-8'),
              keycloakSubjectId,
            });

            // Route to appropriate handler based on topic and event type
            if (topic === config.kafka.topics.userApproved) {
              await this.handleUserApproved(payload, keycloakSubjectId);
            } else if (topic === config.kafka.topics.userRejected) {
              await this.handleUserRejected(payload, keycloakSubjectId);
            } else if (topic === config.kafka.topics.orderEvents) {
              await this.handleOrderEvent(payload, eventType, keycloakSubjectId);
            } else if (topic === config.kafka.topics.productEvents) {
              await this.handleProductEvent(payload, eventType, keycloakSubjectId);
            } else if (topic === config.kafka.topics.userActivity) {
              await this.handleUserActivityEvent(payload, eventType, keycloakSubjectId);
            }

            notificationsProcessed.inc({ topic, status: 'success' });
          } catch (error) {
            notificationsProcessed.inc({ topic, status: 'error' });
            logger.error('Error processing message:', error.message, {
              topic,
              partition,
            });
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

      const emailResult = await emailService.sendApprovalEmail(
        user,
        payload.approved_by || 'Admin',
        payload.approval_reason || 'Verified'
      );

      // Also notify admins
      await this.notifyAdmins(
        `User Approved: ${user.email}`,
        `User ${user.name} (${user.email}) has been approved by ${payload.approved_by || 'Admin'}. Reason: ${payload.approval_reason || 'Verified'}`
      );

      let smsResult = { success: false };
      if (payload.phone_number) {
        smsResult = await smsService.sendApprovalSMS(payload.phone_number, user.name);
      }

      logger.info('Approval notification sent', {
        user_id: payload.user_id,
        keycloakSubjectId,
        email: { sent: emailResult.success, method: emailResult.mode },
        sms: { sent: smsResult.success, method: smsResult.mode },
      });
    } catch (error) {
      logger.error('Error handling user approval:', error.message, { payload, keycloakSubjectId });
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

      const emailResult = await emailService.sendRejectionEmail(
        user,
        payload.rejected_by || 'Admin',
        payload.rejection_reason || 'Not verified'
      );

      // Also notify admins
      await this.notifyAdmins(
        `User Rejected: ${user.email}`,
        `User ${user.name} (${user.email}) has been rejected by ${payload.rejected_by || 'Admin'}. Reason: ${payload.rejection_reason || 'Not verified'}`
      );

      let smsResult = { success: false };
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
        email: { sent: emailResult.success, method: emailResult.mode },
        sms: { sent: smsResult.success, method: smsResult.mode },
      });
    } catch (error) {
      logger.error('Error handling user rejection:', error.message, { payload, keycloakSubjectId });
      throw error;
    }
  }

  /**
   * Handle order events (created, updated, shipped, cancelled)
   */
  async handleOrderEvent(payload, eventType, keycloakSubjectId = null) {
    try {
      logger.info('Processing order event', { eventType, order_id: payload.order_id, keycloakSubjectId });

      if (eventType === 'order:created') {
        await this.handleOrderCreated(payload);
      } else if (eventType === 'order:updated') {
        await this.handleOrderUpdated(payload);
      }
    } catch (error) {
      logger.error('Error handling order event:', error.message, { eventType, payload });
      throw error;
    }
  }

  /**
   * Handle order created event
   */
  async handleOrderCreated(payload) {
    const userEmail = payload.user_email;
    if (!userEmail) {
      logger.warn('Order created event missing user_email, skipping notification');
      return;
    }

    const itemsList = (payload.items || [])
      .map(item => `${item.name || item.product_id} x${item.quantity}`)
      .join(', ');

    const totalAmount = payload.total_amount || 0;

    const result = await emailService.sendOrderCreatedEmail(
      userEmail,
      payload.order_id,
      itemsList,
      totalAmount,
      payload.shipping_address
    );

    // Notify admins about new order
    await this.notifyAdmins(
      `New Order: ${payload.order_id}`,
      `A new order has been placed by ${userEmail}.\nOrder ID: ${payload.order_id}\nItems: ${itemsList}\nTotal: ₹${totalAmount}\nShipping to: ${payload.shipping_address}`
    );

    logger.info('Order created notification sent', {
      order_id: payload.order_id,
      email: { sent: result.success, method: result.mode },
    });
  }

  /**
   * Handle order updated event (status change)
   */
  async handleOrderUpdated(payload) {
    const userEmail = payload.user_email;
    if (!userEmail) {
      logger.warn('Order updated event missing user_email, skipping notification');
      return;
    }

    const result = await emailService.sendOrderStatusUpdateEmail(
      userEmail,
      payload.order_id,
      payload.status,
      payload.notes
    );

    // Notify admins
    await this.notifyAdmins(
      `Order Updated: ${payload.order_id}`,
      `Order ${payload.order_id} status changed to "${payload.status}".\nUser: ${userEmail}\nNotes: ${payload.notes || 'None'}`
    );

    logger.info('Order updated notification sent', {
      order_id: payload.order_id,
      status: payload.status,
      email: { sent: result.success, method: result.mode },
    });
  }

  /**
   * Handle product events (created, updated, deleted)
   */
  async handleProductEvent(payload, eventType, keycloakSubjectId = null) {
    try {
      logger.info('Processing product event', { eventType, product_id: payload.product_id, keycloakSubjectId });

      if (eventType === 'product:created') {
        await this.handleProductCreated(payload);
      } else if (eventType === 'product:updated') {
        await this.handleProductUpdated(payload);
      } else if (eventType === 'product:deleted') {
        await this.handleProductDeleted(payload);
      }
    } catch (error) {
      logger.error('Error handling product event:', error.message, { eventType, payload });
      throw error;
    }
  }

  /**
   * Handle product created event
   */
  async handleProductCreated(payload) {
    await this.notifyAdmins(
      `New Product Added: ${payload.name}`,
      `A new product "${payload.name}" has been added to the store.\n\nDetails:\n- Category: ${payload.category}\n- Price: ₹${payload.price}\n- Stock: ${payload.stock}\n- Created by: ${payload.created_by || 'Unknown'}\n- Time: ${payload.created_at}`
    );

    // Send confirmation email to the creator
    if (payload.created_by) {
      await emailService.sendProductActionEmail(
        payload.created_by,
        'created',
        payload.name,
        payload
      );
    }

    logger.info('Product created notification sent', { product_id: payload.product_id, name: payload.name });
  }

  /**
   * Handle product updated event
   */
  async handleProductUpdated(payload) {
    const updatesStr = JSON.stringify(payload.updates || {}, null, 2);

    await this.notifyAdmins(
      `Product Updated: ${payload.product_id}`,
      `Product ${payload.product_id} has been updated.\n\nUpdated by: ${payload.updated_by || 'Unknown'}\nChanges:\n${updatesStr}\nTime: ${payload.updated_at}`
    );

    // Send confirmation to updater
    if (payload.updated_by) {
      await emailService.sendProductActionEmail(
        payload.updated_by,
        'updated',
        payload.product_id,
        payload
      );
    }

    logger.info('Product updated notification sent', { product_id: payload.product_id });
  }

  /**
   * Handle product deleted event
   */
  async handleProductDeleted(payload) {
    await this.notifyAdmins(
      `Product Deleted: ${payload.product_id}`,
      `Product ${payload.product_id} has been deleted from the store.\n\nDeleted by: ${payload.deleted_by || 'Unknown'}\nTime: ${payload.deleted_at}`
    );

    // Send confirmation to deleter
    if (payload.deleted_by) {
      await emailService.sendProductActionEmail(
        payload.deleted_by,
        'deleted',
        payload.product_id,
        payload
      );
    }

    logger.info('Product deleted notification sent', { product_id: payload.product_id });
  }

  /**
   * Handle user activity events (login, signup, email-verification, email-confirmed)
   */
  async handleUserActivityEvent(payload, eventType, keycloakSubjectId = null) {
    try {
      logger.info('Processing user activity event', { eventType, email: payload.email, keycloakSubjectId });

      if (eventType === 'user:login') {
        await this.handleUserLogin(payload);
      } else if (eventType === 'user:signup') {
        await this.handleUserSignup(payload);
      } else if (eventType === 'user:email-verification') {
        await this.handleEmailVerification(payload);
      } else if (eventType === 'user:email-confirmed') {
        await this.handleEmailConfirmed(payload);
      }
    } catch (error) {
      logger.error('Error handling user activity event:', error.message, { eventType, payload });
      throw error;
    }
  }

  /**
   * Handle user login event
   */
  async handleUserLogin(payload) {
    const result = await emailService.sendLoginNotificationEmail(
      payload.email,
      payload.login_method,
      payload.logged_in_at
    );

    logger.info('Login notification sent', {
      email: payload.email,
      method: payload.login_method,
      result: { sent: result.success, mode: result.mode },
    });
  }

  /**
   * Handle user signup event
   */
  async handleUserSignup(payload) {
    const result = await emailService.sendSignupConfirmationEmail(
      payload.email,
      payload.name,
      payload.user_type
    );

    // Notify admins about new registration
    await this.notifyAdmins(
      `New User Registration: ${payload.email}`,
      `A new user has registered on the platform.\n\nDetails:\n- Name: ${payload.name}\n- Email: ${payload.email}\n- Type: ${payload.user_type}\n- Time: ${payload.registered_at}\n\nPlease review and approve/reject this user in the admin dashboard.`
    );

    logger.info('Signup notification sent', {
      email: payload.email,
      result: { sent: result.success, mode: result.mode },
    });
  }

  /**
   * Handle email verification event - sends verification link to user
   */
  async handleEmailVerification(payload) {
    const result = await emailService.sendEmailVerificationEmail(
      payload.email,
      payload.name,
      payload.verification_token
    );

    logger.info('Email verification link sent', {
      email: payload.email,
      result: { sent: result.success, mode: result.mode },
    });
  }

  /**
   * Handle email confirmed event - user has verified their email
   */
  async handleEmailConfirmed(payload) {
    // Send confirmation to user
    const result = await emailService.sendEmailConfirmedEmail(
      payload.email,
      payload.name
    );

    // Notify admins that user email is now verified
    await this.notifyAdmins(
      `Email Verified: ${payload.email}`,
      `User ${payload.name} (${payload.email}) has verified their email address.\nVerified at: ${payload.confirmed_at}\n\nThis user is now ready for admin approval.`
    );

    logger.info('Email confirmed notification sent', {
      email: payload.email,
      result: { sent: result.success, mode: result.mode },
    });
  }

  /**
   * Send email notification to all admin recipients
   */
  async notifyAdmins(subject, textBody) {
    const adminEmails = config.admin?.emails || [];
    for (const adminEmail of adminEmails) {
      try {
        await emailService.sendEmail(
          adminEmail,
          `[NITTE Admin] ${subject}`,
          textBody,
          this.buildAdminHtml(subject, textBody)
        );
      } catch (err) {
        logger.warn('Failed to notify admin:', { email: adminEmail, error: err.message });
      }
    }
  }

  /**
   * Build a simple HTML template for admin notifications
   */
  buildAdminHtml(subject, textBody) {
    const lines = textBody.split('\n').map(l => `<p style="margin:4px 0;">${l}</p>`).join('');
    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background:#f5f5f5; padding:20px;">
  <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="padding:20px 24px; background:#1976d2; color:#fff;">
      <h2 style="margin:0; font-size:18px;">${subject}</h2>
      <p style="margin:6px 0 0; font-size:12px; opacity:0.8;">${new Date().toISOString()}</p>
    </div>
    <div style="padding:24px; font-size:14px; color:#333; line-height:1.6;">
      ${lines}
    </div>
    <div style="padding:16px 24px; background:#fafafa; border-top:1px solid #eee; font-size:12px; color:#888; text-align:center;">
      NITTE Merchandise Shop &middot; Admin Notification Service
    </div>
  </div>
</body>
</html>`.trim();
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
        config.kafka.topics.orderEvents,
        config.kafka.topics.productEvents,
        config.kafka.topics.userActivity,
      ],
      consumerGroup: config.kafka.consumerGroup,
    };
  }
}

export default NotificationConsumer;

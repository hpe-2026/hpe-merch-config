/**
 * Kafka Notification Consumer
 * Listens to user events and sends notifications
 */

import kafkaConsumerBase from './kafkaConsumer.js';
import logger from '../config/logger.js';

class NotificationConsumer extends kafkaConsumerBase {
  constructor(brokers = ['localhost:9092']) {
    super(brokers);
    this.name = 'NotificationConsumer';
  }

  /**
   * Handle user registered event
   */
  async handleUserRegistered(message) {
    try {
      const userData = JSON.parse(message.value.toString());
      logger.info('Processing user registration notification:', userData);

      // Send notification to user
      await this.sendEmailNotification({
        to: userData.email,
        subject: 'Welcome to NITTE Alumni Shop',
        template: 'welcome',
        data: {
          name: userData.name,
          email: userData.email,
          alumni_id: userData.alumni_id,
        },
      });

      // Notify admins
      await this.sendEmailNotification({
        to: 'admin@nitte.com',
        subject: 'New User Registration Awaiting Approval',
        template: 'registration_pending',
        data: {
          email: userData.email,
          name: userData.name,
          alumni_id: userData.alumni_id,
          registration_time: new Date().toISOString(),
        },
      });

      logger.info('User registration notifications sent:', userData.email);
    } catch (error) {
      logger.error('Failed to handle user registration notification:', error.message);
      throw error;
    }
  }

  /**
   * Handle user approved event
   */
  async handleUserApproved(message) {
    try {
      const eventData = JSON.parse(message.value.toString());
      logger.info('Processing user approved notification:', eventData);

      // Send approval confirmation to user
      await this.sendEmailNotification({
        to: eventData.email,
        subject: 'Welcome to NITTE Alumni Shop - Account Approved',
        template: 'account_approved',
        data: {
          name: eventData.name,
          approval_reason: eventData.approval_reason,
          login_url: 'https://alumni-shop.nitte.edu/login',
        },
      });

      // Log the action
      logger.info('User approval notification sent:', eventData.email);
    } catch (error) {
      logger.error('Failed to handle user approved notification:', error.message);
      throw error;
    }
  }

  /**
   * Handle user rejected event
   */
  async handleUserRejected(message) {
    try {
      const eventData = JSON.parse(message.value.toString());
      logger.info('Processing user rejected notification:', eventData);

      // Send rejection notification to user
      await this.sendEmailNotification({
        to: eventData.email,
        subject: 'NITTE Alumni Shop - Registration Status Update',
        template: 'account_rejected',
        data: {
          email: eventData.email,
          rejection_reason: eventData.rejection_reason,
          support_email: 'support@nitte.com',
        },
      });

      logger.info('User rejection notification sent:', eventData.email);
    } catch (error) {
      logger.error('Failed to handle user rejected notification:', error.message);
      throw error;
    }
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(options) {
    const { to, subject, template, data } = options;

    try {
      // Build email body based on template type
      let htmlContent = this.buildEmailTemplate(template, data);

      logger.info(' Sending Email Notification:', {
        to,
        subject,
        template,
        timestamp: new Date().toISOString(),
      });

      // If configured, use actual email service (SendGrid, AWS SES, Nodemailer)
      // For now, we support both simulated and real sending based on configuration
      if (process.env.EMAIL_SERVICE === 'sendgrid' && process.env.SENDGRID_API_KEY) {
        return await this.sendViaSendGrid(to, subject, htmlContent);
      } else if (process.env.EMAIL_SERVICE === 'nodemailer' && process.env.SMTP_USER) {
        return await this.sendViaNodemailer(to, subject, htmlContent);
      } else if (process.env.EMAIL_SERVICE === 'aws-ses' && process.env.AWS_REGION) {
        return await this.sendViaSES(to, subject, htmlContent);
      }

      // Fallback: Simulated email sending (for development/testing)
      logger.debug(' Email notification (simulated mode):', { to, subject });
      return new Promise((resolve) => {
        setTimeout(() => {
          logger.debug(`Email notification delivered to ${to}`);
          resolve({
            success: true,
            message_id: `msg_${Date.now()}`,
          });
        }, 100);
      });
    } catch (error) {
      logger.error('Failed to send email notification:', {
        to,
        subject,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Build HTML email template based on template type
   */
  buildEmailTemplate(template, data) {
    const baseStyles = `
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
        .header { background-color: #007bff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: white; padding: 20px; }
        .footer { background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 12px; border-radius: 0 0 5px 5px; }
        .button { background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; }
      </style>
    `;

    switch (template) {
      case 'user_approved':
        return `
          ${baseStyles}
          <div class="container">
            <div class="header"><h1>Account Approved!</h1></div>
            <div class="content">
              <p>Dear ${data.name || 'User'},</p>
              <p>Your alumni verification has been approved. You can now access all features of the Alumni Portal.</p>
              <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="button">Login to Portal</a></p>
              <p>Best regards,<br>Alumni Verification Team</p>
            </div>
            <div class="footer">© 2024 AlumniHub. All rights reserved.</div>
          </div>
        `;
      case 'user_rejected':
        return `
          ${baseStyles}
          <div class="container">
            <div class="header"><h1>Verification Update</h1></div>
            <div class="content">
              <p>Dear ${data.name || 'User'},</p>
              <p>Your alumni verification request could not be approved at this time.</p>
              <p>Reason: ${data.reason || 'Your credentials do not match our records.'}</p>
              <p>Please contact support for more information.</p>
              <p>Best regards,<br>Alumni Verification Team</p>
            </div>
            <div class="footer">© 2024 AlumniHub. All rights reserved.</div>
          </div>
        `;
      default:
        return `
          ${baseStyles}
          <div class="container">
            <div class="content">
              <p>Dear ${data.name || 'User'},</p>
              <p>${data.message || 'This is an automated notification.'}</p>
              <p>Best regards,<br>Alumni Verification Team</p>
            </div>
          </div>
        `;
    }
  }

  /**
   * Send email via SendGrid API
   */
  async sendViaSetGrid(to, subject, htmlContent) {
    // Implementation for SendGrid API
    // Requires: npm install @sendgrid/mail
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      
      const msg = {
        to,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@alumnihub.com',
        subject,
        html: htmlContent,
      };

      await sgMail.send(msg);
      logger.info('Email sent via SendGrid:', { to, subject });
      return { success: true, message_id: `sg_${Date.now()}` };
    } catch (error) {
      logger.error('SendGrid error:', error.message);
      throw error;
    }
  }

  /**
   * Send email via Nodemailer with SMTP
   */
  async sendViaNodemailer(to, subject, htmlContent) {
    // Implementation for Nodemailer
    // Requires: npm install nodemailer
    try {
      const nodemailer = require('nodemailer');
      
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const mailOptions = {
        from: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
        to,
        subject,
        html: htmlContent,
      };

      const info = await transporter.sendMail(mailOptions);
      logger.info('Email sent via Nodemailer:', { to, subject, messageId: info.messageId });
      return { success: true, message_id: info.messageId };
    } catch (error) {
      logger.error('Nodemailer error:', error.message);
      throw error;
    }
  }

  /**
   * Send email via AWS SES
   */
  async sendViaSES(to, subject, htmlContent) {
    // Implementation for AWS SES
    // Requires: npm install aws-sdk
    try {
      const AWS = require('aws-sdk');
      
      const ses = new AWS.SES({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });

      const params = {
        Source: process.env.SES_FROM_EMAIL || 'noreply@alumnihub.com',
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Html: { Data: htmlContent } },
        },
      };

      const result = await ses.sendEmail(params).promise();
      logger.info('Email sent via AWS SES:', { to, subject, messageId: result.MessageId });
      return { success: true, message_id: result.MessageId };
    } catch (error) {
      logger.error('AWS SES error:', error.message);
      throw error;
    }
  }

  /**
   * Send SMS notification
   */
  async sendSMSNotification(options) {
    const { phoneNumber, message } = options;

    try {
      logger.info(' Sending SMS Notification:', {
        phoneNumber,
        message,
        timestamp: new Date().toISOString(),
      });

      // Support multiple SMS providers based on configuration
      if (process.env.SMS_SERVICE === 'twilio' && process.env.TWILIO_ACCOUNT_SID) {
        return await this.sendViaTwilio(phoneNumber, message);
      } else if (process.env.SMS_SERVICE === 'aws-sns' && process.env.AWS_REGION) {
        return await this.sendViaSNS(phoneNumber, message);
      } else if (process.env.SMS_SERVICE === 'vonage' && process.env.VONAGE_API_KEY) {
        return await this.sendViaVonage(phoneNumber, message);
      }

      // Fallback: Simulated SMS sending (for development/testing)
      logger.debug(' SMS notification (simulated mode):', { phoneNumber, message });
      return new Promise((resolve) => {
        setTimeout(() => {
          logger.debug(`SMS notification delivered to ${phoneNumber}`);
          resolve({
            success: true,
            message_id: `sms_${Date.now()}`,
          });
        }, 100);
      });
    } catch (error) {
      logger.error('Failed to send SMS notification:', {
        phoneNumber,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send SMS via Twilio
   */
  async sendViaTwilio(phoneNumber, message) {
    try {
      const twilio = require('twilio');
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const result = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });

      logger.info('SMS sent via Twilio:', { phoneNumber, sid: result.sid });
      return { success: true, message_id: result.sid };
    } catch (error) {
      logger.error('Twilio error:', error.message);
      throw error;
    }
  }

  /**
   * Send SMS via AWS SNS
   */
  async sendViaSNS(phoneNumber, message) {
    try {
      const AWS = require('aws-sdk');
      const sns = new AWS.SNS({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });

      const result = await sns.publish({
        Message: message,
        PhoneNumber: phoneNumber,
        MessageAttributes: {
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: 'AlumniHub',
          },
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Transactional',
          },
        },
      }).promise();

      logger.info('SMS sent via AWS SNS:', { phoneNumber, messageId: result.MessageId });
      return { success: true, message_id: result.MessageId };
    } catch (error) {
      logger.error('AWS SNS error:', error.message);
      throw error;
    }
  }

  /**
   * Send SMS via Vonage (Nexmo)
   */
  async sendViaVonage(phoneNumber, message) {
    try {
      const Vonage = require('@vonage/server-sdk');
      const vonage = new Vonage({
        apiKey: process.env.VONAGE_API_KEY,
        apiSecret: process.env.VONAGE_API_SECRET,
      });

      return new Promise((resolve, reject) => {
        vonage.message.sendSms(
          'AlumniHub',
          phoneNumber,
          message,
          { type: 'unicode' },
          (err, responseData) => {
            if (err) {
              logger.error('Vonage error:', err.message);
              reject(err);
            } else {
              if (responseData.messages[0]['status'] === '0') {
                logger.info('SMS sent via Vonage:', { phoneNumber, messageId: responseData.messages[0]['message-id'] });
                resolve({
                  success: true,
                  message_id: responseData.messages[0]['message-id'],
                });
              } else {
                const error = new Error(`Message failed with error: ${responseData.messages[0]['error-text']}`);
                logger.error('Vonage error:', error.message);
                reject(error);
              }
            }
          }
        );
      });
    } catch (error) {
      logger.error('Vonage error:', error.message);
      throw error;
    }
  }

  /**
   * Start consuming notification events
   */
  async start() {
    try {
      await this.connect();

      const consumer = this.consumer;

      // Subscribe to topics
      await consumer.subscribe({ topic: 'user-events', fromBeginning: false });

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const eventType = message.headers?.type?.toString?.();
            logger.debug(`Received message on topic ${topic}:`, {
              key: message.key?.toString?.(),
              type: eventType,
              partition,
            });

            switch (eventType) {
              case 'user.registered':
                await this.handleUserRegistered(message);
                break;

              case 'user.approved':
                await this.handleUserApproved(message);
                break;

              case 'user.rejected':
                await this.handleUserRejected(message);
                break;

              default:
                logger.warn(`Unknown event type: ${eventType}`);
            }
          } catch (error) {
            logger.error('Error processing notification message:', error.message);
            // Don't throw - continue processing other messages
          }
        },
      });

      logger.info('NotificationConsumer started successfully');
    } catch (error) {
      logger.error('Failed to start NotificationConsumer:', error.message);
      throw error;
    }
  }

  /**
   * Stop the consumer
   */
  async stop() {
    try {
      await this.disconnect();
      logger.info('NotificationConsumer stopped');
    } catch (error) {
      logger.error('Failed to stop NotificationConsumer:', error.message);
      throw error;
    }
  }
}

export default NotificationConsumer;

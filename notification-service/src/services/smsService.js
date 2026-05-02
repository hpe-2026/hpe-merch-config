import config from '../config.js';
import logger from '../logger.js';

class SMSService {
  constructor() {
    this.isInitialized = false;
    this.provider = process.env.SMS_SERVICE || 'console';
  }

  /**
   * Initialize SMS service
   */
  async initialize() {
    try {
      logger.info(`SMS service initialized with ${this.provider} provider`);
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize SMS service:', error.message);
      throw error;
    }
  }

  /**
   * Send SMS via console (development mode)
   */
  async sendConsoleSMS(phoneNumber, message) {
    const smsMessage = {
      timestamp: new Date().toISOString(),
      to: phoneNumber,
      message,
    };

    logger.info(' [CONSOLE SMS]', smsMessage);
    return {
      success: true,
      mode: 'console',
      message: 'SMS logged to console',
    };
  }

  /**
   * Send SMS via Twilio
   */
  async sendViaTwilio(phoneNumber, message) {
    try {
      // Lazy load Twilio
      const twilio = (await import('twilio')).default;
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const result = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });

      logger.info('SMS sent via Twilio', { phoneNumber, sid: result.sid });
      return { success: true, mode: 'twilio', messageId: result.sid };
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
      // Lazy load AWS SDK
      const AWS = (await import('aws-sdk')).default;
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
            StringValue: 'NITTE',
          },
          'AWS.SNS.SMS.SMSType': {
            DataType: 'String',
            StringValue: 'Transactional',
          },
        },
      }).promise();

      logger.info('SMS sent via AWS SNS', { phoneNumber, messageId: result.MessageId });
      return { success: true, mode: 'aws-sns', messageId: result.MessageId };
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
      // Lazy load Vonage
      const Vonage = (await import('@vonage/server-sdk')).default;
      const vonage = new Vonage({
        apiKey: process.env.VONAGE_API_KEY,
        apiSecret: process.env.VONAGE_API_SECRET,
      });

      return new Promise((resolve, reject) => {
        vonage.message.sendSms(
          'NITTE',
          phoneNumber,
          message,
          { type: 'unicode' },
          (err, responseData) => {
            if (err) {
              logger.error('Vonage error:', err.message);
              reject(err);
            } else {
              if (responseData.messages[0]['status'] === '0') {
                logger.info('SMS sent via Vonage', {
                  phoneNumber,
                  messageId: responseData.messages[0]['message-id'],
                });
                resolve({
                  success: true,
                  mode: 'vonage',
                  messageId: responseData.messages[0]['message-id'],
                });
              } else {
                const error = new Error(`Vonage error: ${responseData.messages[0]['error-text']}`);
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
   * Send SMS (routing to configured provider)
   */
  async sendSMS(phoneNumber, message) {
    if (!this.isInitialized) {
      logger.warn('SMS service not initialized');
      return { success: false, message: 'SMS service not initialized' };
    }

    if (!process.env.SMS_ENABLED || process.env.SMS_ENABLED === 'false') {
      logger.info('SMS sending disabled by configuration');
      return { success: false, message: 'SMS service disabled' };
    }

    try {
      if (this.provider === 'console') {
        return await this.sendConsoleMS(phoneNumber, message);
      } else if (this.provider === 'twilio') {
        return await this.sendViaTwilio(phoneNumber, message);
      } else if (this.provider === 'aws-sns') {
        return await this.sendViaSNS(phoneNumber, message);
      } else if (this.provider === 'vonage') {
        return await this.sendViaVonage(phoneNumber, message);
      } else {
        logger.warn(`Unknown SMS provider: ${this.provider}`);
        return { success: false, message: 'Unknown SMS provider' };
      }
    } catch (error) {
      logger.error('Error sending SMS:', error.message);
      // Fallback to console mode
      try {
        return await this.sendConsoleMS(phoneNumber, message);
      } catch (fallbackError) {
        logger.error('SMS sending failed completely:', fallbackError.message);
        return { success: false, message: error.message };
      }
    }
  }

  /**
   * Send rejection SMS notification
   */
  async sendRejectionSMS(phoneNumber, userName, reason) {
    const message = `Hi ${userName}, your NITTE Alumni registration was not approved. Reason: ${reason}. Contact support@nitte.com for details.`;
    return this.sendSMS(phoneNumber, message);
  }

  /**
   * Send approval SMS notification
   */
  async sendApprovalSMS(phoneNumber, userName) {
    const message = `Congratulations ${userName}! Your NITTE Alumni registration has been approved. Log in now at alumni.nitte.com`;
    return this.sendSMS(phoneNumber, message);
  }

  /**
   * Disconnect SMS service
   */
  async disconnect() {
    logger.info('SMS service disconnected');
  }
}

// Export singleton instance
const smsService = new SMSService();
export default smsService;

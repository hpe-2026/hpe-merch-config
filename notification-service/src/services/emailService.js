import nodemailer from 'nodemailer';
import config from '../config.js';
import logger from '../logger.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.isInitialized = false;
    this.provider = config.email.provider;
  }

  /**
   * Initialize email service
   */
  async initialize() {
    try {
      if (this.provider === 'console') {
        logger.info('Email service initialized in CONSOLE mode (development)');
        this.isInitialized = true;
        return;
      }

      if (this.provider === 'sendgrid') {
        logger.info('Email service initialized with SendGrid provider');
        this.isInitialized = true;
        return;
      }

      if (this.provider === 'aws-ses') {
        logger.info('Email service initialized with AWS SES provider');
        this.isInitialized = true;
        return;
      }

      // SMTP configuration (default)
      const smtpConfig = {
        host: config.email.smtp.host,
        port: config.email.smtp.port,
        secure: config.email.smtp.secure,
        auth: {
          user: config.email.smtp.auth.user,
          pass: config.email.smtp.auth.pass,
        },
      };

      this.transporter = nodemailer.createTransport(smtpConfig);

      // Verify connection
      await this.transporter.verify();
      logger.info('Email service initialized with SMTP provider', {
        host: config.email.smtp.host,
        port: config.email.smtp.port,
      });
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize email service:', error.message);
      throw error;
    }
  }

  /**
   * Send email via console (development mode)
   */
  async sendConsoleEmail(to, subject, text, html) {
    const message = {
      timestamp: new Date().toISOString(),
      to,
      subject,
      text,
      html: html || text,
    };

    logger.info(' [CONSOLE EMAIL]', message);
    return {
      success: true,
      mode: 'console',
      message: 'Email logged to console',
    };
  }

  /**
   * Send email via SendGrid
   */
  async sendViaSetGrid(to, subject, text, html) {
    try {
      // Lazy load SendGrid module
      const sgMail = (await import('@sendgrid/mail')).default;
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      const msg = {
        to,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@nitte.com',
        subject,
        text,
        html: html || text,
      };

      const result = await sgMail.send(msg);
      logger.info('Email sent via SendGrid', { to, subject, messageId: result[0].headers['x-message-id'] });
      return {
        success: true,
        mode: 'sendgrid',
        messageId: result[0].headers['x-message-id'],
      };
    } catch (error) {
      logger.error('SendGrid error:', error.message);
      throw error;
    }
  }

  /**
   * Send email via AWS SES
   */
  async sendViaSES(to, subject, text, html) {
    try {
      // Lazy load AWS SDK
      const AWS = (await import('aws-sdk')).default;
      const ses = new AWS.SES({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });

      const params = {
        Source: process.env.SES_FROM_EMAIL || 'noreply@nitte.com',
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Html: { Data: html || text }, Text: { Data: text } },
        },
      };

      const result = await ses.sendEmail(params).promise();
      logger.info('Email sent via AWS SES', { to, subject, messageId: result.MessageId });
      return {
        success: true,
        mode: 'aws-ses',
        messageId: result.MessageId,
      };
    } catch (error) {
      logger.error('AWS SES error:', error.message);
      throw error;
    }
  }

  /**
   * Send email via SMTP
   */
  async sendSmtpEmail(to, subject, text, html) {
    if (!this.transporter) {
      throw new Error('Email service not initialized');
    }

    try {
      const mailOptions = {
        from: config.email.smtp.from,
        to,
        subject,
        text,
        html: html || text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent successfully', {
        messageId: info.messageId,
        to,
        subject,
      });

      return {
        success: true,
        mode: 'smtp',
        messageId: info.messageId,
      };
    } catch (error) {
      logger.error('Failed to send email via SMTP:', error.message);
      throw error;
    }
  }

  /**
   * Send email (routing to configured provider)
   */
  async sendEmail(to, subject, text, html) {
    if (!this.isInitialized) {
      logger.warn('Email service not initialized');
      return { success: false, message: 'Email service not initialized' };
    }

    if (!config.email.enabled) {
      logger.info('Email sending disabled by configuration');
      return { success: false, message: 'Email service disabled' };
    }

    try {
      if (this.provider === 'console') {
        return await this.sendConsoleEmail(to, subject, text, html);
      } else if (this.provider === 'sendgrid') {
        return await this.sendViaSetGrid(to, subject, text, html);
      } else if (this.provider === 'aws-ses') {
        return await this.sendViaSES(to, subject, text, html);
      } else if (this.provider === 'smtp' || !this.provider) {
        return await this.sendSmtpEmail(to, subject, text, html);
      } else {
        logger.warn(`Unknown email provider: ${this.provider}`);
        return { success: false, message: 'Unknown email provider' };
      }
    } catch (error) {
      logger.error('Error sending email:', error.message);
      // Fallback: try console mode
      try {
        return await this.sendConsoleEmail(to, subject, text, html);
      } catch (fallbackError) {
        logger.error('Email sending failed completely:', fallbackError.message);
        return { success: false, message: error.message };
      }
    }
  }

  /**
   * Send user approval email
   */
  async sendApprovalEmail(user, approver, reason) {
    const subject = ' Your NITTE Alumni Account Has Been Approved!';
    const text = `
Hi ${user.name},

Great news! Your registration for the NITTE Merchandise Shop has been approved.

Approval Details:
- Email: ${user.email}
- Alumni ID: ${user.alumni_id || 'N/A'}
- Approved By: ${approver}
- Reason: ${reason || 'Verified alumni'}

You can now log in to your account and start shopping!

Best regards,
NITTE Merchandise Shop Team
    `.trim();

    const html = `
<html>
  <body style="font-family: Arial, sans-serif;">
    <h2> Your NITTE Alumni Account Has Been Approved!</h2>
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>Great news! Your registration for the NITTE Merchandise Shop has been <strong>approved</strong>.</p>
    
    <h3>Approval Details:</h3>
    <ul>
      <li><strong>Email:</strong> ${user.email}</li>
      <li><strong>Alumni ID:</strong> ${user.alumni_id || 'N/A'}</li>
      <li><strong>Approved By:</strong> ${approver}</li>
      <li><strong>Reason:</strong> ${reason || 'Verified alumni'}</li>
    </ul>
    
    <p>You can now <strong>log in</strong> to your account and start shopping!</p>
    
    <hr>
    <p style="color: #888; font-size: 12px;">Best regards,<br/>NITTE Merchandise Shop Team</p>
  </body>
</html>
    `.trim();

    return this.sendEmail(user.email, subject, text, html);
  }

  /**
   * Send user rejection email
   */
  async sendRejectionEmail(user, rejector, reason) {
    const subject = ' NITTE Alumni Account Registration - Status Update';
    const text = `
Hi ${user.name},

We have reviewed your registration for the NITTE Merchandise Shop.

Unfortunately, we were unable to approve your account at this time.

Details:
- Email: ${user.email}
- Alumni ID: ${user.alumni_id || 'N/A'}
- Processed By: ${rejector}
- Reason: ${reason || 'Not verified as alumni'}

If you believe this is an error, please contact support@nitte.com with your verification documents.

Best regards,
NITTE Merchandise Shop Team
    `.trim();

    const html = `
<html>
  <body style="font-family: Arial, sans-serif;">
    <h2> NITTE Alumni Account Registration - Status Update</h2>
    <p>Hi <strong>${user.name}</strong>,</p>
    <p>We have reviewed your registration for the NITTE Merchandise Shop.</p>
    
    <p style="color: #d32f2f; font-weight: bold;">Unfortunately, we were unable to approve your account at this time.</p>
    
    <h3>Details:</h3>
    <ul>
      <li><strong>Email:</strong> ${user.email}</li>
      <li><strong>Alumni ID:</strong> ${user.alumni_id || 'N/A'}</li>
      <li><strong>Processed By:</strong> ${rejector}</li>
      <li><strong>Reason:</strong> ${reason || 'Not verified as alumni'}</li>
    </ul>
    
    <p>If you believe this is an error, please contact <strong>support@nitte.com</strong> with your verification documents.</p>
    
    <hr>
    <p style="color: #888; font-size: 12px;">Best regards,<br/>NITTE Merchandise Shop Team</p>
  </body>
</html>
    `.trim();

    return this.sendEmail(user.email, subject, text, html);
  }

  /**
   * Disconnect email service
   */
  async disconnect() {
    if (this.transporter) {
      try {
        await this.transporter.close();
        logger.info('Email service disconnected');
      } catch (error) {
        logger.warn('Error disconnecting email service:', error.message);
      }
    }
  }
}

// Export singleton instance
const emailService = new EmailService();
export default emailService;

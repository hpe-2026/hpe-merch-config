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

      // Skip SMTP if credentials are not configured
      if (!config.email.smtp.auth.user || !config.email.smtp.auth.pass) {
        logger.warn('SMTP credentials not configured — falling back to CONSOLE mode');
        this.provider = 'console';
        this.isInitialized = true;
        return;
      }

      this.transporter = nodemailer.createTransport(smtpConfig);

      // Verify connection
      await this.transporter.verify();
      logger.info('Email service initialized with SMTP provider', {
        host: config.email.smtp.host,
        port: config.email.smtp.port,
      });
      this.isInitialized = true;
    } catch (error) {
      logger.warn('SMTP connection failed — falling back to CONSOLE mode:', String(error.message || error));
      this.provider = 'console';
      this.isInitialized = true;
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
   * Send order created confirmation email
   */
  async sendOrderCreatedEmail(userEmail, orderId, itemsList, totalAmount, shippingAddress) {
    const subject = '✓ Your NITTE Order Has Been Placed!';
    const text = `
Hi there,

Your order has been placed successfully!

Order Details:
- Order ID: ${orderId}
- Items: ${itemsList}
- Total Amount: ₹${totalAmount}
- Shipping Address: ${shippingAddress}

We'll notify you when your order status changes.

Best regards,
NITTE Merchandise Shop Team
    `.trim();

    const html = `
<html>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="padding: 24px; background: #4caf50; color: #fff;">
      <h2 style="margin: 0;">✓ Order Placed Successfully!</h2>
    </div>
    <div style="padding: 24px;">
      <p>Hi there,</p>
      <p>Your order has been placed successfully!</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Order ID</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${orderId}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Items</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${itemsList}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Total Amount</td><td style="padding: 8px; border-bottom: 1px solid #eee;">₹${totalAmount}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Shipping Address</td><td style="padding: 8px;">${shippingAddress}</td></tr>
      </table>
      <p>We'll notify you when your order status changes.</p>
    </div>
    <div style="padding: 16px 24px; background: #fafafa; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">
      NITTE Merchandise Shop
    </div>
  </div>
</body>
</html>`.trim();

    return this.sendEmail(userEmail, subject, text, html);
  }

  /**
   * Send order status update email
   */
  async sendOrderStatusUpdateEmail(userEmail, orderId, status, notes) {
    const statusEmoji = {
      pending: '⏳',
      confirmed: '✓',
      processing: '⚙️',
      shipped: '🚚',
      delivered: '📦',
      cancelled: '✗',
    };

    const emoji = statusEmoji[status] || '📋';
    const subject = `${emoji} Order ${orderId} - Status Update: ${status.toUpperCase()}`;
    const text = `
Hi there,

Your order status has been updated.

Order ID: ${orderId}
New Status: ${status}
${notes ? `Notes: ${notes}` : ''}

Best regards,
NITTE Merchandise Shop Team
    `.trim();

    const html = `
<html>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="padding: 24px; background: #1976d2; color: #fff;">
      <h2 style="margin: 0;">${emoji} Order Status Update</h2>
    </div>
    <div style="padding: 24px;">
      <p>Hi there,</p>
      <p>Your order status has been updated:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Order ID</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${orderId}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">New Status</td><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong style="color: #1976d2;">${status.toUpperCase()}</strong></td></tr>
        ${notes ? `<tr><td style="padding: 8px; font-weight: bold;">Notes</td><td style="padding: 8px;">${notes}</td></tr>` : ''}
      </table>
    </div>
    <div style="padding: 16px 24px; background: #fafafa; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">
      NITTE Merchandise Shop
    </div>
  </div>
</body>
</html>`.trim();

    return this.sendEmail(userEmail, subject, text, html);
  }

  /**
   * Send product action email (created/updated/deleted)
   */
  async sendProductActionEmail(recipientEmail, action, productName, details) {
    const actionLabels = {
      created: { emoji: '🆕', label: 'Created', color: '#4caf50' },
      updated: { emoji: '✏️', label: 'Updated', color: '#ff9800' },
      deleted: { emoji: '🗑️', label: 'Deleted', color: '#f44336' },
    };

    const { emoji, label, color } = actionLabels[action] || { emoji: '📋', label: action, color: '#1976d2' };
    const subject = `${emoji} Product ${label}: ${productName}`;
    const text = `
Product ${label} Confirmation
============================
Product: ${productName}
Action: ${label}
Time: ${details.created_at || details.updated_at || details.deleted_at || new Date().toISOString()}

Best regards,
NITTE Merchandise Shop Team
    `.trim();

    const html = `
<html>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="padding: 24px; background: ${color}; color: #fff;">
      <h2 style="margin: 0;">${emoji} Product ${label}</h2>
    </div>
    <div style="padding: 24px;">
      <p>Your product action has been completed successfully.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Product</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${productName}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Action</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${label}</td></tr>
        ${details.category ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Category</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${details.category}</td></tr>` : ''}
        ${details.price ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Price</td><td style="padding: 8px; border-bottom: 1px solid #eee;">₹${details.price}</td></tr>` : ''}
        <tr><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">${details.created_at || details.updated_at || details.deleted_at || new Date().toISOString()}</td></tr>
      </table>
    </div>
    <div style="padding: 16px 24px; background: #fafafa; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">
      NITTE Merchandise Shop
    </div>
  </div>
</body>
</html>`.trim();

    return this.sendEmail(recipientEmail, subject, text, html);
  }

  /**
   * Send login notification email
   */
  async sendLoginNotificationEmail(email, loginMethod, loginTime) {
    const subject = '🔐 New Login to Your NITTE Account';
    const text = `
Hi there,

A new login was detected on your NITTE Merchandise Shop account.

Details:
- Email: ${email}
- Method: ${loginMethod}
- Time: ${loginTime || new Date().toISOString()}

If this was you, no action is needed. If you didn't log in, please change your password immediately.

Best regards,
NITTE Merchandise Shop Team
    `.trim();

    const html = `
<html>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="padding: 24px; background: #1976d2; color: #fff;">
      <h2 style="margin: 0;">🔐 New Login Detected</h2>
    </div>
    <div style="padding: 24px;">
      <p>A new login was detected on your account.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${email}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Login Method</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${loginMethod}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">${loginTime || new Date().toISOString()}</td></tr>
      </table>
      <p style="color: #d32f2f; font-weight: bold;">If this wasn't you, please change your password immediately.</p>
    </div>
    <div style="padding: 16px 24px; background: #fafafa; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">
      NITTE Merchandise Shop
    </div>
  </div>
</body>
</html>`.trim();

    return this.sendEmail(email, subject, text, html);
  }

  /**
   * Send signup confirmation email
   */
  async sendSignupConfirmationEmail(email, name, userType) {
    const subject = '🎉 Welcome to NITTE Merchandise Shop!';
    const text = `
Hi ${name},

Thank you for registering on the NITTE Merchandise Shop!

Your Details:
- Email: ${email}
- Account Type: ${userType}
- Status: Pending Admin Approval

Your account is currently pending admin approval. You'll receive an email once your account has been reviewed.

Best regards,
NITTE Merchandise Shop Team
    `.trim();

    const html = `
<html>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="padding: 24px; background: #4caf50; color: #fff;">
      <h2 style="margin: 0;">🎉 Welcome to NITTE Merchandise Shop!</h2>
    </div>
    <div style="padding: 24px;">
      <p>Hi <strong>${name}</strong>,</p>
      <p>Thank you for registering!</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${email}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Account Type</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${userType}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold;">Status</td><td style="padding: 8px;"><span style="color: #ff9800; font-weight: bold;">⏳ Pending Approval</span></td></tr>
      </table>
      <p>Your account is currently pending admin approval. You'll receive an email once your account has been reviewed.</p>
    </div>
    <div style="padding: 16px 24px; background: #fafafa; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">
      NITTE Merchandise Shop
    </div>
  </div>
</body>
</html>`.trim();

    return this.sendEmail(email, subject, text, html);
  }

  /**
   * Send email verification link
   */
  async sendEmailVerificationEmail(email, name, verificationToken) {
    const verifyUrl = `${process.env.API_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000'}/api/v1/auth/verify-email/${verificationToken}`;
    const subject = '📧 Verify Your Email - NITTE Merchandise Shop';
    const text = `
Hi ${name},

Thank you for registering on the NITTE Merchandise Shop!

Please verify your email address by clicking the link below:

${verifyUrl}

This link will expire once used. If you did not create an account, please ignore this email.

Best regards,
NITTE Merchandise Shop Team
    `.trim();

    const html = `
<html>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="padding: 24px; background: #1976d2; color: #fff;">
      <h2 style="margin: 0;">📧 Verify Your Email Address</h2>
    </div>
    <div style="padding: 24px;">
      <p>Hi <strong>${name}</strong>,</p>
      <p>Thank you for registering! Please verify your email address to complete your registration.</p>
      <div style="margin: 24px 0; text-align: center;">
        <a href="${verifyUrl}" style="display: inline-block; padding: 14px 32px; background: #4caf50; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
          ✓ Verify My Email
        </a>
      </div>
      <p style="font-size: 13px; color: #666;">Or copy and paste this link in your browser:</p>
      <p style="font-size: 12px; color: #888; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px;">${verifyUrl}</p>
      <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
      <p style="font-size: 12px; color: #888;">If you did not create an account, please ignore this email.</p>
    </div>
    <div style="padding: 16px 24px; background: #fafafa; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">
      NITTE Merchandise Shop
    </div>
  </div>
</body>
</html>`.trim();

    return this.sendEmail(email, subject, text, html);
  }

  /**
   * Send email confirmed success notification
   */
  async sendEmailConfirmedEmail(email, name) {
    const subject = '✓ Email Verified - NITTE Merchandise Shop';
    const text = `
Hi ${name},

Your email address has been verified successfully!

Your account is now pending admin approval. You will receive another email once an admin has reviewed your registration.

What happens next:
1. An admin will review your registration details
2. You will receive an approval or rejection email
3. Once approved, you can log in and start shopping

Best regards,
NITTE Merchandise Shop Team
    `.trim();

    const html = `
<html>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="padding: 24px; background: #4caf50; color: #fff;">
      <h2 style="margin: 0;">✓ Email Verified Successfully!</h2>
    </div>
    <div style="padding: 24px;">
      <p>Hi <strong>${name}</strong>,</p>
      <p>Your email address has been verified successfully!</p>
      <div style="margin: 20px 0; padding: 16px; background: #e8f5e9; border-radius: 6px; border-left: 4px solid #4caf50;">
        <p style="margin: 0; color: #2e7d32; font-weight: bold;">What happens next?</p>
        <ol style="margin: 10px 0 0; padding-left: 20px; color: #333;">
          <li>An admin will review your registration details</li>
          <li>You will receive an approval or rejection email</li>
          <li>Once approved, you can log in and start shopping!</li>
        </ol>
      </div>
      <p>Your account status: <strong style="color: #ff9800;">⏳ Pending Admin Approval</strong></p>
    </div>
    <div style="padding: 16px 24px; background: #fafafa; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">
      NITTE Merchandise Shop
    </div>
  </div>
</body>
</html>`.trim();

    return this.sendEmail(email, subject, text, html);
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

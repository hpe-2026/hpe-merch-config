import logger from '../logger.js';
import emailService from './emailService.js';
import slackService from './slackService.js';
import ticketService from './ticketService.js';

class KeycloakEventHandler {
  constructor() {
    this.adminEmails = (process.env.KEYCLOAK_ADMIN_EMAILS || 'internal-admin@nitte.ac.in')
      .split(',').map(s => s.trim()).filter(Boolean);
  }

  async initialize() {
    await slackService.initialize();
    await ticketService.initialize();
    logger.info('Keycloak event handler initialized');
  }

  async handleEvent(event) {
    try {
      const isSecurity = this.isSecurityEvent(event);
      const isAdmin = event.eventCategory === 'admin';

      logger.info('Handling Keycloak event', {
        type: event.eventType,
        category: event.eventCategory,
        realm: event.realmId,
        security: isSecurity,
      });

      // Always send Slack for security/admin events
      if (isSecurity || isAdmin) {
        await slackService.sendKeycloakAlert(event);
      }

      // Create ticket for high-severity events
      if (isSecurity || event.error) {
        await ticketService.createKeycloakTicket(event);
      }

      // Email admins for critical events
      if (isSecurity || event.error || isAdmin) {
        await this.sendAdminEmail(event);
      }

      logger.info('Keycloak event processed', { type: event.eventType });
      return { success: true, channels: { slack: true, ticket: isSecurity || !!event.error, email: true } };
    } catch (error) {
      logger.error('Failed to handle Keycloak event:', error.message, { eventType: event.eventType });
      return { success: false, error: error.message };
    }
  }

  isSecurityEvent(event) {
    const type = (event.eventType || '').toUpperCase();
    const error = !!event.error;
    return error
      || type.includes('LOGIN_ERROR')
      || type.includes('UPDATE_PASSWORD')
      || type.includes('REMOVE_TOTP')
      || type.includes('REMOVE_CREDENTIAL')
      || type.includes('DELETE_ACCOUNT');
  }

  async sendAdminEmail(event) {
    const isError = !!event.error;
    const subject = isError
      ? `SECURITY ALERT: ${event.eventType} in ${event.realmId}`
      : `Keycloak Admin Event: ${event.eventType}`;

    const text = `
Keycloak Event Notification
===========================
Event Type:    ${event.eventType}
Category:      ${event.eventCategory}
Realm:         ${event.realmId}
Client:        ${event.clientId || 'N/A'}
User ID:       ${event.userId || 'N/A'}
IP Address:    ${event.ipAddress || 'N/A'}
Resource Type: ${event.resourceType || 'N/A'}
Resource Path: ${event.resourcePath || 'N/A'}
Error:         ${event.error || 'None'}

Details:
${JSON.stringify(event.details || {}, null, 2)}
    `.trim();

    const detailsJson = JSON.stringify(event.details || {}, null, 2);
    const accent = isError ? '#d32f2f' : '#1976d2';
    const headerBg = isError ? '#ffebee' : '#e3f2fd';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { padding: 24px; border-left: 5px solid ${accent}; background: ${headerBg}; }
    .header h2 { margin: 0; font-size: 18px; color: ${accent}; }
    .header p { margin: 6px 0 0; font-size: 13px; color: #666; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; background: ${accent}; color: #fff; }
    .content { padding: 24px; }
    table { width: 100%; border-collapse: collapse; }
    tr:not(:last-child) td { border-bottom: 1px solid #eee; }
    td { padding: 10px 0; font-size: 14px; vertical-align: top; }
    td.label { width: 130px; color: #888; font-weight: 500; }
    td.value { color: #333; }
    td.value code { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Monaco, monospace; font-size: 12px; }
    .error { color: #d32f2f; font-weight: 600; }
    pre { background: #f8f9fa; padding: 14px; border-radius: 6px; overflow-x: auto; font-size: 12px; line-height: 1.5; color: #444; border: 1px solid #eee; }
    .footer { padding: 16px 24px; background: #fafafa; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">${isError ? 'Security Alert' : 'Admin Event'}</span>
      <h2>${event.eventType}</h2>
      <p>${new Date().toISOString()}</p>
    </div>
    <div class="content">
      <table>
        <tr><td class="label">Category</td><td class="value"><code>${event.eventCategory}</code></td></tr>
        <tr><td class="label">Realm</td><td class="value">${event.realmId}</td></tr>
        <tr><td class="label">Client</td><td class="value"><code>${event.clientId || 'N/A'}</code></td></tr>
        <tr><td class="label">User ID</td><td class="value"><code>${event.userId || 'N/A'}</code></td></tr>
        <tr><td class="label">IP Address</td><td class="value">${event.ipAddress || 'N/A'}</td></tr>
        ${event.resourceType ? `<tr><td class="label">Resource Type</td><td class="value">${event.resourceType}</td></tr>` : ''}
        ${event.resourcePath ? `<tr><td class="label">Resource Path</td><td class="value"><code>${event.resourcePath}</code></td></tr>` : ''}
        <tr><td class="label">Error</td><td class="value ${event.error ? 'error' : ''}">${event.error || 'None'}</td></tr>
      </table>
      <h4 style="margin: 20px 0 8px; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Event Details</h4>
      <pre>${detailsJson}</pre>
    </div>
    <div class="footer">
      Sent by NITTE Notification Service &middot; Keycloak Security Monitoring
    </div>
  </div>
</body>
</html>
    `.trim();

    for (const email of this.adminEmails) {
      try {
        await emailService.sendEmail(email, subject, text, html);
      } catch (err) {
        logger.error('Failed to send admin email:', err.message, { email });
      }
    }
  }
}

const keycloakEventHandler = new KeycloakEventHandler();
export default keycloakEventHandler;

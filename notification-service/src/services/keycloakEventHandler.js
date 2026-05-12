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
    const subject = event.error
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

    for (const email of this.adminEmails) {
      try {
        await emailService.sendEmail(email, subject, text);
      } catch (err) {
        logger.error('Failed to send admin email:', err.message, { email });
      }
    }
  }
}

const keycloakEventHandler = new KeycloakEventHandler();
export default keycloakEventHandler;

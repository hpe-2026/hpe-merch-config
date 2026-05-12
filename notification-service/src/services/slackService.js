import config from '../config.js';
import logger from '../logger.js';

class SlackService {
  constructor() {
    this.webhookUrl = config.slack?.webhookUrl || process.env.SLACK_WEBHOOK_URL || '';
    this.enabled = config.slack?.enabled !== false && !!this.webhookUrl;
  }

  async initialize() {
    if (!this.enabled) {
      logger.info('Slack service disabled');
      return;
    }
    logger.info('Slack service initialized');
  }

  async sendMessage(message) {
    if (!this.enabled) {
      logger.info('[CONSOLE SLACK]', message);
      return { success: true, mode: 'console', message: 'Logged to console' };
    }
    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      if (!response.ok) throw new Error(`Slack webhook ${response.status}`);
      logger.info('Slack sent', { status: response.status });
      return { success: true, mode: 'slack', status: response.status };
    } catch (error) {
      logger.error('Slack error:', error.message);
      logger.info('[CONSOLE SLACK FALLBACK]', message);
      return { success: true, mode: 'console-fallback', error: error.message };
    }
  }

  async sendKeycloakAlert(event) {
    const title = event.error ? `Keycloak Alert: ${event.eventType}` : `Keycloak Event: ${event.eventType}`;
    const lines = [title, `Category: ${event.eventCategory}`, `Realm: ${event.realmId}`, `User: ${event.userId}`, `IP: ${event.ipAddress}`];
    if (event.error) lines.push(`Error: ${event.error}`);
    if (event.resourceType) lines.push(`Resource: ${event.resourceType}`);
    if (event.resourcePath) lines.push(`Path: ${event.resourcePath}`);
    return this.sendMessage(lines.join(' | '));
  }
}

const slackService = new SlackService();
export default slackService;

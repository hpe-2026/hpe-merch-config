import config from '../config.js';
import logger from '../logger.js';

class TicketService {
  constructor() {
    this.provider = config.ticket?.provider || process.env.TICKET_PROVIDER || 'console';
    this.endpoint = config.ticket?.endpoint || process.env.TICKET_ENDPOINT || '';
    this.enabled = config.ticket?.enabled !== false;
  }

  async initialize() {
    if (!this.enabled) {
      logger.info('Ticket service disabled');
      return;
    }
    logger.info(`Ticket service initialized (${this.provider})`);
  }

  async createTicket({ title, description, severity = 'medium', source = 'keycloak' }) {
    if (!this.enabled) {
      logger.info('[CONSOLE TICKET]', { title, description, severity, source });
      return { success: true, mode: 'console', ticketId: `TICKET-${Date.now()}` };
    }

    try {
      if (this.provider === 'console') {
        logger.info('[CONSOLE TICKET]', { title, description, severity, source });
        return { success: true, mode: 'console', ticketId: `TICKET-${Date.now()}` };
      }

      if (this.provider === 'rest' && this.endpoint) {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, severity, source }),
        });
        if (!response.ok) throw new Error(`Ticket endpoint ${response.status}`);
        const data = await response.json();
        logger.info('Ticket created via REST', { ticketId: data.ticketId });
        return { success: true, mode: 'rest', ticketId: data.ticketId };
      }

      logger.warn(`Unknown ticket provider: ${this.provider}`);
      return { success: false, mode: 'unknown', message: 'Unknown provider' };
    } catch (error) {
      logger.error('Ticket creation failed:', error.message);
      logger.info('[CONSOLE TICKET FALLBACK]', { title, description, severity, source });
      return { success: true, mode: 'console-fallback', ticketId: `TICKET-${Date.now()}`, error: error.message };
    }
  }

  async createKeycloakTicket(event) {
    const severity = event.error ? 'high' : 'medium';
    const title = `Keycloak ${event.eventType} — ${event.realmId || 'unknown realm'}`;
    const description = JSON.stringify(event, null, 2);
    return this.createTicket({ title, description, severity, source: 'keycloak' });
  }
}

const ticketService = new TicketService();
export default ticketService;

import express from 'express'
import client from 'prom-client'
import logger from './logger.js'
import keycloakEventHandler from './services/keycloakEventHandler.js'

const register = new client.Registry()
client.collectDefaultMetrics({ register, prefix: 'notification_' })

export const notificationsProcessed = new client.Counter({
  name: 'notifications_processed_total',
  help: 'Total Kafka events processed by the notification service',
  labelNames: ['topic', 'status'],
  registers: [register],
})

export const notificationsLatency = new client.Histogram({
  name: 'notifications_processing_duration_seconds',
  help: 'Time spent processing each Kafka event',
  labelNames: ['topic'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
})

export const keycloakEventsReceived = new client.Counter({
  name: 'keycloak_events_received_total',
  help: 'Total Keycloak events received via REST API',
  labelNames: ['category', 'status'],
  registers: [register],
})

export function startMetricsServer({ port = 9100, getStatus } = {}) {
  const app = express()

  app.get('/health', (_req, res) => {
    const status = getStatus ? getStatus() : { ready: true }
    res.status(status.connected === false ? 503 : 200).json({
      service: 'notification-service',
      status: status.connected === false ? 'degraded' : 'healthy',
      ...status,
      timestamp: new Date().toISOString(),
    })
  })

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType)
    res.end(await register.metrics())
  })

  app.use(express.json({ limit: '256kb' }))

  app.post('/api/v1/events', async (req, res) => {
    const event = req.body
    if (!event || !event.eventType) {
      keycloakEventsReceived.inc({ category: 'unknown', status: 'rejected' })
      return res.status(400).json({ error: 'Missing eventType in payload' })
    }
    try {
      const result = await keycloakEventHandler.handleEvent(event)
      keycloakEventsReceived.inc({ category: event.eventCategory || 'unknown', status: 'success' })
      res.status(200).json({ received: true, ...result })
    } catch (error) {
      keycloakEventsReceived.inc({ category: event.eventCategory || 'unknown', status: 'error' })
      logger.error('Error handling Keycloak event:', error.message)
      res.status(500).json({ error: 'Internal processing error' })
    }
  })

  app.get('/', (_req, res) => {
    res.json({
      service: 'notification-service',
      endpoints: ['/health', '/metrics', '/api/v1/events'],
    })
  })

  app.listen(port, '0.0.0.0', () => {
    logger.info(`Metrics server listening on :${port}`)
  })
}

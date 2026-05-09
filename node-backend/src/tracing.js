import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import otelApi from '@opentelemetry/api';
import logger from './config/logger.js';

const { trace, context, propagation, baggage } = otelApi;

// Create OTLP HTTP exporter
const traceExporter = new OTLPTraceExporter({
  url: `http://${process.env.JAEGER_HOST || 'jaeger'}:4318/v1/traces`,
});

// Create SDK
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'nitte-api-gateway',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
  traceExporter: traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

// Start SDK
sdk.start();
logger.info('OpenTelemetry SDK started for nitte-api-gateway');
logger.info(`Tracing to Jaeger at ${process.env.JAEGER_HOST || 'jaeger'}:4318/v1/traces`);

// Get tracer
const tracer = trace.getTracer('nitte-api-gateway', '1.0.0');

/**
 * Set Keycloak Subject ID as baggage for distributed tracing correlation
 * This ensures the immutable identity travels with the trace across services
 */
export function setKeycloakSubjectInBaggage(keycloakSubjectId, userEmail, userRoles = []) {
  if (!keycloakSubjectId) return context.active();

  const currentBaggage = baggage.getBaggage() || baggage.createBaggage();

  const newBaggage = currentBaggage.setEntry('keycloak.subject_id', { value: keycloakSubjectId })
    .setEntry('keycloak.user_email', { value: userEmail || 'anonymous' })
    .setEntry('keycloak.user_roles', { value: JSON.stringify(userRoles) });

  const newContext = baggage.setBaggage(context.active(), newBaggage);
  return newContext;
}

/**
 * Get Keycloak Subject ID from baggage for correlation
 */
export function getKeycloakSubjectFromBaggage() {
  const currentBaggage = baggage.getBaggage();
  if (!currentBaggage) return null;

  const entry = currentBaggage.getEntry('keycloak.subject_id');
  return entry?.value || null;
}

/**
 * Create a span with Keycloak identity tags for persistent identity mapping
 */
export function createAuthenticatedSpan(name, options = {}, keycloakSubjectId, userEmail, userRoles) {
  const spanOptions = {
    ...options,
    attributes: {
      ...options.attributes,
      'keycloak.subject_id': keycloakSubjectId || 'anonymous',
      'keycloak.user_email': userEmail || 'anonymous',
      'keycloak.user_roles': JSON.stringify(userRoles || []),
    },
  };

  return tracer.startSpan(name, spanOptions);
}

export default tracer;
export { trace, context, propagation, baggage, otelApi, sdk };

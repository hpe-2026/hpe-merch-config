import express from 'express';
import axios from 'axios';
import logger from '../config/logger.js';

const router = express.Router();

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';
const JAEGER_URL = process.env.JAEGER_URL || 'http://jaeger:16686';

/**
 * Proxy endpoint for Prometheus metrics queries
 * GET /api/v1/metrics/query?query=...
 */
router.get('/query', async (req, res) => {
  try {
    const { query, start, end, step } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter is required',
      });
    }

    // Build Prometheus query URL
    const params = new URLSearchParams({
      query,
      ...(start && { start }),
      ...(end && { end }),
      ...(step && { step }),
    });

    const response = await axios.get(
      `${PROMETHEUS_URL}/api/v1/query`,
      { params }
    );

    res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    logger.error('Metrics query error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to query metrics',
      error: error.message,
    });
  }
});

/**
 * Proxy endpoint for Prometheus range queries
 * GET /api/v1/metrics/query_range?query=...&start=...&end=...&step=...
 */
router.get('/query_range', async (req, res) => {
  try {
    const { query, start, end, step } = req.query;

    if (!query || !start || !end) {
      return res.status(400).json({
        success: false,
        message: 'Query, start, and end parameters are required',
      });
    }

    const params = new URLSearchParams({
      query,
      start,
      end,
      step: step || '60',
    });

    const response = await axios.get(
      `${PROMETHEUS_URL}/api/v1/query_range`,
      { params }
    );

    res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    logger.error('Metrics range query error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to query metrics range',
      error: error.message,
    });
  }
});

/**
 * Get instant metric values for dashboard
 * GET /api/v1/metrics/dashboard
 * Returns: requests_per_sec, error_rate, p95_latency, active_connections
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Get the metrics register to read counters directly
    const { productsViewed, ordersCreated, authAttempts, databaseOperations } = await import('../metrics.js').then(m => {
      const metrics = m.register.metrics();
      return { productsViewed: 0, ordersCreated: 0, authAttempts: 0, databaseOperations: 0 };
    });
    
    // Parse the Prometheus format metrics to get current values
    let metricsText = '';
    try {
      const { register } = await import('../metrics.js');
      metricsText = await register.metrics();
    } catch (e) {
      logger.warn('Could not read local metrics:', e.message);
    }
    
    let productsViewedVal = 0;
    let ordersCreatedVal = 0;
    let authAttemptsVal = 0;
    let dbOpsVal = 0;
    
    // Extract values from Prometheus text format
    const lines = metricsText.split('\n');
    for (const line of lines) {
      if (line.match(/^products_viewed_total\s+\d/) && !line.includes('{')) {
        productsViewedVal = parseFloat(line.split(/\s+/)[1]) || 0;
      }
      if (line.match(/^orders_created_total\s+\d/) && !line.includes('{')) {
        ordersCreatedVal = parseFloat(line.split(/\s+/)[1]) || 0;
      }
      if (line.match(/^auth_attempts_total\s+\d/) && !line.includes('{')) {
        authAttemptsVal = parseFloat(line.split(/\s+/)[1]) || 0;
      }
      if (line.match(/^database_operations_total\s+\d/) && !line.includes('{')) {
        dbOpsVal = parseFloat(line.split(/\s+/)[1]) || 0;
      }
    }
    
    // Query Prometheus for request metrics
    const queries = {
      requests_per_sec: 'sum(rate(http_requests_total[5m]))',
      error_rate: 'sum(rate(http_requests_total{status_code=~"5.."}[5m])) / (sum(rate(http_requests_total[5m])) + 0.0001)',
      p95_latency: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',
      active_connections: 'active_connections',
    };

    const results = {
      products_viewed: productsViewedVal.toFixed(2),
      orders_rate: ordersCreatedVal.toFixed(2),
      auth_attempts: authAttemptsVal.toFixed(2),
      db_operations: dbOpsVal.toFixed(2),
    };

    // Query each Prometheus metric
    for (const [key, query] of Object.entries(queries)) {
      try {
        const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
          params: { query },
          timeout: 5000,
        });

        if (response.data.data.result.length > 0) {
          let value = response.data.data.result[0].value[1];
          // Handle NaN values
          if (isNaN(value) || value === 'NaN') {
            value = '0';
          }
          results[key] = parseFloat(value).toFixed(2);
        } else {
          results[key] = '0';
        }
      } catch (err) {
        logger.warn(`Failed to query ${key}:`, err.message);
        results[key] = '0';
      }
    }

    res.status(200).json({
      success: true,
      data: results,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Dashboard metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard metrics',
      error: error.message,
    });
  }
});

/**
 * Get Jaeger traces
 * GET /api/v1/metrics/traces?service=...&limit=...
 */
router.get('/traces', async (req, res) => {
  try {
    const { service, limit = 20, tags } = req.query;

    const params = new URLSearchParams({
      ...(service && { service }),
      limit,
      ...(tags && { tags }),
    });

    const response = await axios.get(
      `${JAEGER_URL}/api/traces`,
      { params }
    );

    res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    logger.error('Traces query error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch traces',
      error: error.message,
    });
  }
});

/**
 * Get Jaeger services list
 * GET /api/v1/metrics/services
 */
router.get('/services', async (req, res) => {
  try {
    const response = await axios.get(
      `${JAEGER_URL}/api/services`
    );

    res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    logger.error('Services query error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services',
      error: error.message,
    });
  }
});

/**
 * Health check for monitoring stack
 * GET /api/v1/metrics/health
 */
router.get('/health', async (req, res) => {
  const health = {
    prometheus: { status: 'unknown' },
    jaeger: { status: 'unknown' },
  };

  // Check Prometheus
  try {
    await axios.get(`${PROMETHEUS_URL}/-/healthy`, { timeout: 2000 });
    health.prometheus.status = 'healthy';
  } catch (err) {
    health.prometheus.status = 'unhealthy';
    health.prometheus.error = err.message;
  }

  // Check Jaeger (try multiple endpoints)
  try {
    await axios.get(`${JAEGER_URL}/api/services`, { timeout: 2000 });
    health.jaeger.status = 'healthy';
  } catch (err) {
    try {
      // Fallback to root endpoint
      await axios.get(`${JAEGER_URL}`, { timeout: 2000 });
      health.jaeger.status = 'healthy';
    } catch (err2) {
      health.jaeger.status = 'unhealthy';
      health.jaeger.error = err2.message;
    }
  }

  const allHealthy = health.prometheus.status === 'healthy' && health.jaeger.status === 'healthy';
  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    data: health,
  });
});

export default router;

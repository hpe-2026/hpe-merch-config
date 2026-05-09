import express from 'express';
import logger from '../config/logger.js';

const router = express.Router();

const JAEGER_API = process.env.JAEGER_API_URL || 'http://jaeger:16686/api';
const JAEGER_UI = process.env.JAEGER_UI_URL || 'http://jaeger:16686';

// Health check for Jaeger
router.get('/health', async (req, res) => {
  try {
    // Try multiple health check endpoints
    let response;
    let endpoint = '';
    
    try {
      // First try the services endpoint (most reliable)
      endpoint = `${JAEGER_API}/services`;
      response = await fetch(endpoint, { timeout: 5000 });
      if (response.ok || response.status === 204) {
        return res.json({ status: 'online', endpoint });
      }
    } catch (e) {
      logger.debug(`Health check failed on ${endpoint}:`, e.message);
    }
    
    try {
      // Fall back to UI endpoint
      endpoint = `${JAEGER_UI}/`;
      response = await fetch(endpoint, { timeout: 5000 });
      if (response.ok) {
        return res.json({ status: 'online', endpoint });
      }
    } catch (e) {
      logger.debug(`Health check failed on ${endpoint}:`, e.message);
    }
    
    // If we get here, Jaeger is offline
    logger.warn('Jaeger health check failed - service not responding');
    res.status(503).json({ status: 'offline', message: 'Jaeger service not responding' });
  } catch (err) {
    logger.error('Jaeger health check error:', err.message);
    res.status(503).json({ status: 'offline', error: err.message });
  }
});

// Get services
router.get('/services', async (req, res) => {
  try {
    const response = await fetch(`${JAEGER_API}/services`, { timeout: 10000 });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch services' });
    }
    const data = await response.json();
    // Sort services alphabetically for stable ordering
    if (data.data && Array.isArray(data.data)) {
      data.data = data.data.sort();
    }
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch services from Jaeger:', err.message);
    res.status(503).json({ error: 'Jaeger is unavailable' });
  }
});

// Get traces for a service
router.get('/traces', async (req, res) => {
  try {
    const { service, limit = 20, offset = 0, lookback = '1h' } = req.query;
    
    if (!service) {
      return res.status(400).json({ error: 'Service parameter required' });
    }

    // Fetch all traces from Jaeger (request more to get total count for pagination)
    const url = new URL(`${JAEGER_API}/traces`);
    url.searchParams.append('service', service);
    url.searchParams.append('limit', Math.max(100, parseInt(limit) * 5)); // Fetch more to calculate total
    url.searchParams.append('lookback', lookback);

    const response = await fetch(url.toString(), { timeout: 15000 });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch traces' });
    }
    const jaegerData = await response.json();
    
    // Extract traces array from Jaeger response
    const allTraces = jaegerData.data || jaegerData || [];
    const totalTraces = allTraces.length;
    
    // Apply pagination
    const offsetNum = parseInt(offset) || 0;
    const limitNum = parseInt(limit) || 20;
    const paginatedTraces = allTraces.slice(offsetNum, offsetNum + limitNum);
    
    // Return paginated response with total count
    res.json({
      success: true,
      data: paginatedTraces,
      total: totalTraces,
      limit: limitNum,
      offset: offsetNum
    });
  } catch (err) {
    logger.error('Failed to fetch traces from Jaeger:', err.message);
    res.status(503).json({ error: 'Jaeger is unavailable' });
  }
});

// Get trace details
router.get('/traces/:traceId', async (req, res) => {
  try {
    const { traceId } = req.params;
    
    if (!traceId) {
      return res.status(400).json({ error: 'Trace ID required' });
    }

    const response = await fetch(`${JAEGER_API}/traces/${traceId}`, { timeout: 10000 });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Trace not found' });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch trace details:', err.message);
    res.status(503).json({ error: 'Jaeger is unavailable' });
  }
});

// Get span metrics
router.get('/services/:service/operations', async (req, res) => {
  try {
    const { service } = req.params;
    const { spanKind } = req.query;

    if (!service) {
      return res.status(400).json({ error: 'Service parameter required' });
    }

    const url = new URL(`${JAEGER_API}/services/${service}/operations`);
    if (spanKind) {
      url.searchParams.append('spanKind', spanKind);
    }

    const response = await fetch(url.toString(), { timeout: 10000 });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch operations' });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch operations:', err.message);
    res.status(503).json({ error: 'Jaeger is unavailable' });
  }
});

export default router;

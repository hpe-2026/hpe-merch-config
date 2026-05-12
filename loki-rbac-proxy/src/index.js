import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import http from 'http';

const PORT = parseInt(process.env.PORT || '3200', 10);
const LOKI_URL = process.env.LOKI_URL || 'http://loki:3100';
const KEYCLOAK_JWKS_URL = process.env.KEYCLOAK_JWKS_URL || 'http://keycloak:8080/realms/nitte-realm/protocol/openid-connect/certs';
const PROMTAIL_API_KEY = process.env.PROMTAIL_API_KEY || 'promtail-loki-secret';
const ADMIN_ROLE = process.env.ADMIN_ROLE || 'keycloak-admin';
const DEFAULT_TENANT = process.env.DEFAULT_TENANT || 'default';
const ADMIN_TENANT = process.env.ADMIN_TENANT || 'keycloak-admin';
const OAUTH_AUDIENCE = process.env.OAUTH_AUDIENCE || ''; // optional audience validation

let jwks = null;

async function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(KEYCLOAK_JWKS_URL));
  }
  return jwks;
}

async function verifyToken(token) {
  try {
    const verifyOptions = {
      issuer: `http://keycloak:8080/realms/nitte-realm`,
      clockTolerance: 60,
    };
    if (OAUTH_AUDIENCE) {
      verifyOptions.audience = OAUTH_AUDIENCE;
    }
    const { payload } = await jwtVerify(token, await getJWKS(), verifyOptions);
    return payload;
  } catch (e) {
    console.error('JWT verification failed:', e.message);
    return null;
  }
}

function getTenantId(payload) {
  const roles = payload?.realm_access?.roles || [];
  if (roles.includes(ADMIN_ROLE)) return ADMIN_TENANT;
  return DEFAULT_TENANT;
}

function proxyRequest(req, res, targetUrl, headers) {
  const url = new URL(req.url, targetUrl);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode);
    Object.entries(proxyRes.headers).forEach(([k, v]) => {
      if (v !== undefined) res.setHeader(k, v);
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Bad Gateway', message: err.message });
    }
  });

  req.pipe(proxyReq);
}

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'loki-rbac-proxy' });
});

app.use((req, res, next) => {
  // Allow Promtail push traffic with API key
  if (req.method === 'POST' && req.url.startsWith('/loki/api/v1/push')) {
    const apiKey = req.headers['x-promtail-api-key'];
    if (apiKey === PROMTAIL_API_KEY) {
      const tenantId = req.headers['x-scope-orgid'] || DEFAULT_TENANT;
      const headers = { ...req.headers };
      delete headers['x-promtail-api-key'];
      headers['x-scope-orgid'] = tenantId;
      return proxyRequest(req, res, LOKI_URL, headers);
    }
    return res.status(401).json({ error: 'Unauthorized Promtail push' });
  }

  // For query requests, validate JWT from Grafana if present; otherwise default tenant
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Grafana backend proxy may not forward OAuth identity; fall back to default tenant
    const headers = { ...req.headers };
    headers['x-scope-orgid'] = DEFAULT_TENANT;
    delete headers['authorization'];
    console.log(`Proxy ${req.method} ${req.url} unauthenticated -> tenant ${DEFAULT_TENANT}`);
    return proxyRequest(req, res, LOKI_URL, headers);
  }

  const token = authHeader.slice(7);
  verifyToken(token).then((payload) => {
    if (!payload) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const tenantId = getTenantId(payload);
    const headers = { ...req.headers };
    headers['x-scope-orgid'] = tenantId;
    delete headers['authorization']; // Do not forward to Loki

    console.log(`Proxy ${req.method} ${req.url} for user ${payload.preferred_username || payload.sub} -> tenant ${tenantId}`);
    proxyRequest(req, res, LOKI_URL, headers);
  }).catch((err) => {
    console.error('JWT verification error:', err.message);
    res.status(500).json({ error: 'Internal proxy error' });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Loki RBAC Proxy listening on :${PORT}`);
  console.log(`Forwarding to Loki at ${LOKI_URL}`);
  console.log(`Keycloak JWKS: ${KEYCLOAK_JWKS_URL}`);
});

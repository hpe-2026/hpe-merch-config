// API Configuration - automatically detects environment

function getAPIBase() {
  // If API URL is set via environment variable, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }

  // If running in browser
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    const port = window.location.port

    // If accessing via localhost (development)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000'
    }

    // Default to api port on same host (assumes reverse proxy is configured)
    return `${protocol}//${hostname}${port ? ':' + port : ''}`
  }

  // Fallback for SSR or server-side
  return 'http://node-backend:3000'
}

export const API_BASE = getAPIBase()

// Derive the external URL of a sibling service exposed at <sub>.<env-domain>.
// e.g. from admin.dev.nitte.local -> keycloak.dev.nitte.local (same port/tunnel).
// Falls back to conventional localhost dev ports.
export function serviceUrl(sub) {
  if (typeof window === 'undefined') return ''
  const { protocol, hostname, port } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const devPorts = { keycloak: 8080, jenkins: 8081, jaeger: 16686, grafana: 3001, prometheus: 9090, minio: 9001 }
    return `http://localhost:${devPorts[sub] || ''}`
  }
  const base = hostname.split('.').slice(1).join('.') || hostname
  return `${protocol}//${sub}.${base}${port ? ':' + port : ''}`
}

// Helper to get auth headers
export const auth = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
})

// Helper to get auth headers with content type for uploads
export const authUpload = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'multipart/form-data',
  },
})

export default API_BASE

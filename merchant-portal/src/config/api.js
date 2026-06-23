// API configuration for Merchant Portal
// Detects environment so the SPA calls the API on the SAME origin it was
// served from (works behind the Istio gateway / reverse proxy), instead of a
// hard-coded localhost:3000 which breaks when accessed via a real hostname.

function getAPIBase() {
  // Explicit override always wins
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location
    // Local dev (vite dev server) talks to the backend on :3000
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return import.meta.env.DEV ? 'http://localhost:3000' : `${protocol}//${hostname}${port ? ':' + port : ''}`
    }
    // Served behind a gateway/proxy: use the same origin (relative API calls)
    return `${protocol}//${hostname}${port ? ':' + port : ''}`
  }

  return 'http://node-backend:3000'
}

export const API_BASE = getAPIBase()

// Images are served via the backend proxy (/api/v1/upload/images/...), so the
// MinIO base mirrors the API origin.
export const MINIO_BASE = API_BASE

// Helper to get auth headers
export const auth = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('merchant_token')}`,
  },
})

// Helper to get auth headers with content type for uploads
export const authUpload = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('merchant_token')}`,
    'Content-Type': 'multipart/form-data',
  },
})

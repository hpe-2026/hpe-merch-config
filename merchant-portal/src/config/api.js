// API configuration for Merchant Portal
const isDev = import.meta.env.DEV

export const API_BASE = isDev 
  ? 'http://localhost:3000' 
  : (import.meta.env.VITE_API_BASE || 'http://localhost:3000')

export const MINIO_BASE = isDev
  ? 'http://localhost:9000'
  : (import.meta.env.VITE_MINIO_BASE || 'http://localhost:9000')

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

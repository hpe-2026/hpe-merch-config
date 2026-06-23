import axios from 'axios'
import { useAuthStore } from '../../features/auth/store/authStore'

// Resolve the API base from the current origin so it works behind the Istio
// gateway / reverse proxy. Only fall back to localhost:3000 for local dev.
function resolveApiBase() {
  if (import.meta.env?.VITE_API_URL) return `${import.meta.env.VITE_API_URL}/api/v1`
  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000/api/v1'
    }
    return `${protocol}//${hostname}${port ? ':' + port : ''}/api/v1`
  }
  return '/api/v1'
}

const API_BASE_URL = resolveApiBase()

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000
})

// Add token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token || localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear auth
      useAuthStore.getState().logout()
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default apiClient

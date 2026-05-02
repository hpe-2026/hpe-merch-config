import axios from 'axios'
import { useAuthStore } from '../../features/auth/store/authStore'

const API_BASE_URL = 'http://localhost:3000/api/v1'

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

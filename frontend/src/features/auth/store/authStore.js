import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'
import { API_BASE } from '../../../config/api'

const API_BASE_URL = `${API_BASE}/api/v1`

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Actions
      setUser(user) {
        set({ user })
      },

      setToken(token) {
        set({ token })
      },

      signup: async (email, password, name, alumni_id = '', department = '', graduation_year = '') => {
        set({ isLoading: true, error: null })
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/signup`, {
            email,
            password,
            name,
            alumni_id,
            department,
            graduation_year
          })

          const res = response.data
          const data = res.data || res.user || {}
          const tokens = res.tokens || { access_token: res.token }
          const userData = {
            userId: data.user_id || data.id,
            email: data.email,
            name: data.name,
            role: data.role || data.roles?.[0] || 'user',
            roles: data.roles || (data.role ? [data.role] : ['user'])
          }

          localStorage.setItem('token', tokens.access_token)
          localStorage.setItem('user', JSON.stringify(userData))

          set({
            user: userData,
            token: tokens.access_token,
            refreshToken: tokens.refresh_token || tokens.access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          })

          return { success: true, user: userData }
        } catch (err) {
          const errorMessage = err.response?.data?.message || 'Signup failed'
          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false
          })
          return { success: false, error: errorMessage }
        }
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/login`, {
            email,
            password
          })

          const res = response.data
          // Support both wrapped { data, tokens } and flat { token, user } responses
          const data = res.data || res.user || {}
          const tokens = res.tokens || { access_token: res.token }
          const userData = {
            userId: data.user_id || data.id,
            email: data.email,
            name: data.name,
            role: data.role || data.roles?.[0] || 'user',
            roles: data.roles || (data.role ? [data.role] : ['user']),
            profileImage: data.profileImage || null,
            phone: data.phone || null,
            address: data.address || null,
          }

          // Persist to localStorage for admin-dashboard compatibility
          localStorage.setItem('token', tokens.access_token)
          localStorage.setItem('user', JSON.stringify(userData))

          set({
            user: userData,
            token: tokens.access_token,
            refreshToken: tokens.refresh_token || tokens.access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          })

          return { success: true, user: userData }
        } catch (err) {
          const errorMessage = err.response?.data?.message || 'Login failed'
          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false
          })
          return { success: false, error: errorMessage }
        }
      },

      logout: () => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null
        })
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get()
        if (!refreshToken) {
          set({ isAuthenticated: false })
          return false
        }

        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: refreshToken
          })

          set({ token: response.data.tokens.access_token })
          return true
        } catch (err) {
          set({ isAuthenticated: false, token: null, refreshToken: null })
          return false
        }
      },

      updateUser: (updates) => {
        const currentUser = get().user
        if (!currentUser) return
        const updated = { ...currentUser, ...updates }
        localStorage.setItem('user', JSON.stringify(updated))
        set({ user: updated })
      },

      restoreSession: async () => {
        const currentToken = get().token
        const currentUser = get().user
        if (currentToken && currentUser) {
          set({ isAuthenticated: true })
          return true
        }
        return false
      }
    }),
    {
      name: 'auth-store',
      // Optional: customize which fields to persist
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)

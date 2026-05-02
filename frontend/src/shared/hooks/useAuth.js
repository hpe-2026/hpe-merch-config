import { useAuthStore } from '../../features/auth/store/authStore'

export const useAuth = () => {
  return useAuthStore()
}

export const useIsAuthenticated = () => {
  return useAuthStore(state => state.isAuthenticated)
}

export const useUser = () => {
  return useAuthStore(state => state.user)
}

export const useToken = () => {
  return useAuthStore(state => state.token)
}

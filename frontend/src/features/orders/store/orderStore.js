import { create } from 'zustand'
import axios from 'axios'
import { API_BASE } from '../../../config/api'

const API_BASE_URL = `${API_BASE}/api/v1`

export const useOrderStore = create((set, get) => ({
  // State
  orders: [],
  currentOrder: null,
  isLoading: false,
  error: null,

  // Actions
  fetchOrders: async (token) => {
    set({ isLoading: true, error: null })
    try {
      const response = await axios.get(`${API_BASE_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      set({
        orders: response.data.data || response.data,
        isLoading: false
      })
      return { success: true }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to fetch orders'
      set({
        error: errorMessage,
        isLoading: false
      })
      return { success: false, error: errorMessage }
    }
  },

  fetchOrderById: async (orderId, token) => {
    set({ isLoading: true, error: null })
    try {
      const response = await axios.get(`${API_BASE_URL}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      set({
        currentOrder: response.data.data || response.data,
        isLoading: false
      })
      return { success: true, order: response.data.data }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to fetch order'
      set({
        error: errorMessage,
        isLoading: false
      })
      return { success: false, error: errorMessage }
    }
  },

  createOrder: async (orderData, token) => {
    set({ isLoading: true, error: null })
    try {
      const response = await axios.post(
        `${API_BASE_URL}/orders`,
        orderData,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      const newOrder = response.data.data || response.data
      set(state => ({
        orders: [newOrder, ...state.orders],
        currentOrder: newOrder,
        isLoading: false
      }))
      return { success: true, order: newOrder }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Failed to create order'
      set({
        error: errorMessage,
        isLoading: false
      })
      return { success: false, error: errorMessage }
    }
  },

  clearCurrentOrder: () => {
    set({ currentOrder: null })
  },

  getOrderById: (orderId) => {
    return get().orders.find(o => o._id === orderId || o.order_id === orderId)
  },

  getOrdersByStatus: (status) => {
    return get().orders.filter(o => o.status === status)
  }
}))

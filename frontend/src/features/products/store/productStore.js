import { create } from 'zustand'
import axios from 'axios'
import { API_BASE } from '../../../config/api'

const API_BASE_URL = `${API_BASE}/api/v1`

export const useProductStore = create((set, get) => ({
  // State
  products: [],
  isLoading: false,
  error: null,
  filter: {
    category: null,
    search: '',
    priceRange: { min: 0, max: 10000 }
  },

  // Actions
  fetchProducts: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await axios.get(`${API_BASE_URL}/products`)
      set({
        products: response.data.data || response.data,
        isLoading: false
      })
    } catch (err) {
      set({
        error: err.message || 'Failed to fetch products',
        isLoading: false
      })
    }
  },

  getProductById: (id) => {
    return get().products.find(p => p._id === id)
  },

  searchProducts: (query) => {
    const { products, filter } = get()
    return products.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.description.toLowerCase().includes(query.toLowerCase())
    )
  },

  filterByCategory: (category) => {
    set(state => ({
      filter: { ...state.filter, category }
    }))
  },

  filterByPrice: (min, max) => {
    set(state => ({
      filter: { ...state.filter, priceRange: { min, max } }
    }))
  },

  getFilteredProducts: () => {
    const { products, filter } = get()
    return products.filter(p => {
      const matchCategory = !filter.category || p.category === filter.category
      const matchPrice = p.price >= filter.priceRange.min && p.price <= filter.priceRange.max
      const matchSearch = !filter.search || 
        p.name.toLowerCase().includes(filter.search.toLowerCase())
      return matchCategory && matchPrice && matchSearch
    })
  },

  clearFilters: () => {
    set({
      filter: {
        category: null,
        search: '',
        priceRange: { min: 0, max: 10000 }
      }
    })
  }
}))

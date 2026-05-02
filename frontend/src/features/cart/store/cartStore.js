import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useCartStore = create(
  persist(
    (set, get) => ({
      // State
      items: [], // { _id, name, price, quantity }
      total: 0,
      itemCount: 0,

      // Actions
      addItem: (product, quantity = 1) => {
        set(state => {
          const existingItem = state.items.find(item => item._id === product._id)
          let newItems

          if (existingItem) {
            newItems = state.items.map(item =>
              item._id === product._id
                ? { ...item, quantity: item.quantity + quantity }
                : item
            )
          } else {
            newItems = [...state.items, { ...product, quantity }]
          }

          return {
            items: newItems,
            total: get().calculateTotal(newItems),
            itemCount: get().calculateItemCount(newItems)
          }
        })
      },

      removeItem: (productId) => {
        set(state => {
          const newItems = state.items.filter(item => item._id !== productId)
          return {
            items: newItems,
            total: get().calculateTotal(newItems),
            itemCount: get().calculateItemCount(newItems)
          }
        })
      },

      updateQuantity: (productId, quantity) => {
        set(state => {
          let newItems
          if (quantity <= 0) {
            newItems = state.items.filter(item => item._id !== productId)
          } else {
            newItems = state.items.map(item =>
              item._id === productId ? { ...item, quantity } : item
            )
          }

          return {
            items: newItems,
            total: get().calculateTotal(newItems),
            itemCount: get().calculateItemCount(newItems)
          }
        })
      },

      clearCart: () => {
        set({
          items: [],
          total: 0,
          itemCount: 0
        })
      },

      getCartItems: () => get().items,

      getCartTotal: () => get().total,

      getCartItemCount: () => get().itemCount,

      getCartSummary: () => {
        const { items, total } = get()
        return {
          items,
          subtotal: total,
          tax: 0, // Future: implement tax calculation
          total: total
        }
      },

      // Helpers
      calculateTotal: (items) => {
        return items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      },

      calculateItemCount: (items) => {
        return items.reduce((count, item) => count + item.quantity, 0)
      }
    }),
    {
      name: 'cart-store',
      partialize: (state) => ({
        items: state.items,
        total: state.total,
        itemCount: state.itemCount
      })
    }
  )
)

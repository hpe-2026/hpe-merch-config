import { useCartStore } from '../../features/cart/store/cartStore'

export const useCart = () => {
  return useCartStore()
}

export const useCartItems = () => {
  return useCartStore(state => state.items)
}

export const useCartTotal = () => {
  return useCartStore(state => state.total)
}

export const useCartItemCount = () => {
  return useCartStore(state => state.itemCount)
}

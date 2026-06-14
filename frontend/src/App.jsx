import { useEffect, useState } from 'react'
import { ShoppingCart, Home, Package, LogOut, GraduationCap } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from './config/api'

// Zustand stores
import { useAuthStore } from './features/auth/store/authStore'
import { useCartStore } from './features/cart/store/cartStore'
import { useProductStore } from './features/products/store/productStore'
import { useOrderStore } from './features/orders/store/orderStore'

// Components (existing + new)
import ProductList from './components/ProductList'
import Cart from './components/Cart'
import Orders from './components/Orders'
import Profile from './components/Profile'
import Navbar from './components/Navbar'
import Logo from './components/Logo'
import AuthPage from './components/Login'
import Landing from './components/Landing'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState('products')
  const [apiStatus, setApiStatus] = useState('checking')
  const [initialized, setInitialized] = useState(false)

  // Use Zustand stores instead of local state
  const { user, isAuthenticated, restoreSession, logout: zustandLogout } = useAuthStore()
  const { items: cartItems, addItem: addToCart, removeItem: removeFromCart, updateQuantity: updateCartQuantity, clearCart } = useCartStore()
  const { fetchProducts } = useProductStore()
  const { fetchOrders } = useOrderStore()

  // Initialize auth session from localStorage
  useEffect(() => {
    const initSession = async () => {
      await restoreSession()
      // Fallback: if zustand persist didn't restore, try localStorage directly
      const currentState = useAuthStore.getState()
      if (!currentState.isAuthenticated) {
        const token = localStorage.getItem('token')
        const userStr = localStorage.getItem('user')
        if (token && userStr) {
          try {
            const user = JSON.parse(userStr)
            useAuthStore.setState({
              token,
              user,
              isAuthenticated: true,
              refreshToken: token,
            })
          } catch (e) { /* ignore parse errors */ }
        }
      }
      setInitialized(true)
    }
    initSession()
  }, [restoreSession])

  // Fetch products on mount
  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Fetch user orders when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const token = useAuthStore.getState().token
      if (token) {
        fetchOrders(token)
      }
    }
  }, [isAuthenticated, fetchOrders])

  // Check API health with retry logic
  useEffect(() => {
    const checkHealth = async () => {
      for (let i = 0; i < 3; i++) {
        try {
          const response = await axios.get(`${API_BASE}/api/v1/health`, {
            timeout: 5000
          })
          if (response.status === 200) {
            setApiStatus('online')
            return
          }
        } catch (error) {
          if (i < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          } else {
            setApiStatus('offline')
          }
        }
      }
    }
    
    checkHealth()
    
    // Re-check health every 30 seconds
    const healthInterval = setInterval(checkHealth, 30000)
    return () => clearInterval(healthInterval)
  }, [])

  // Handle logout using Zustand
  const handleLogout = () => {
    zustandLogout()
    clearCart()
    setCurrentPage('products')
  }

  const handleSignupSuccess = () => {
    setCurrentPage('products')
  }

  const handleAddToCart = (product) => {
    if (!isAuthenticated) {
      // Redirect to login if not authenticated
      setCurrentPage('login')
    } else {
      addToCart(product)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {!initialized ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm text-slate-500">Preparing your store…</p>
          </div>
        </div>
      ) : (
        <>
          {!isAuthenticated && currentPage === 'login' ? (
            <Landing onLoginSuccess={() => setCurrentPage('products')} />
          ) : (
            <>
              <Navbar 
                cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                apiStatus={apiStatus}
                user={user}
                onLogout={handleLogout}
                isAuthenticated={isAuthenticated}
              />

              <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                {/* API Status Alert */}
                {apiStatus === 'offline' && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
                    The backend API is unreachable. Some features may not work until it comes back online.
                  </div>
                )}

                {currentPage === 'products' && (
                  <ProductList onAddToCart={addToCart} />
                )}

                {currentPage === 'cart' && (
                  <Cart 
                    cartItems={cartItems}
                    onRemove={removeFromCart}
                    onUpdateQuantity={updateCartQuantity}
                    setCurrentPage={setCurrentPage}
                  />
                )}

                {currentPage === 'orders' && (
                  <Orders />
                )}

                {currentPage === 'profile' && (
                  <Profile user={user} onLogout={handleLogout} />
                )}
              </main>

              {/* Footer */}
              <footer className="border-t border-slate-200 bg-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                      <GraduationCap className="w-4 h-4 text-white" strokeWidth={2.25} />
                    </div>
                    <p className="text-sm text-slate-600">
                      © {new Date().getFullYear()} NITTE Alumni Association
                    </p>
                  </div>
                  <p className="text-xs text-slate-400">
                    System status: <span className={apiStatus === 'online' ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                      {apiStatus === 'online' ? 'All systems operational' : 'Service degraded'}
                    </span>
                  </p>
                </div>
              </footer>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default App

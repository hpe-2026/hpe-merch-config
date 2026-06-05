import { useState, useEffect } from 'react'
import axios from 'axios'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import MerchantLayout from './components/MerchantLayout'
import MerchantLogin from './pages/MerchantLogin'
import MerchantDashboard from './pages/MerchantDashboard'
import MerchantProducts from './pages/MerchantProducts'
import MerchantOrders from './pages/MerchantOrders'
import MerchantProfile from './pages/MerchantProfile'
import { API_BASE } from './config/api'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session
    const token = localStorage.getItem('merchant_token')
    const userData = localStorage.getItem('merchant_user')
    
    if (token && userData) {
      try {
        const parsed = JSON.parse(userData)
        // Verify user has merchant role
        const hasMerchantRole = parsed.roles?.some(r => 
          ['merchant', 'merchant-admin', 'merchant-staff', 'merchant-amazon', 'merchant-flipkart'].includes(r)
        )
        if (hasMerchantRole) {
          setUser(parsed)
        }
      } catch (e) {
        console.error('Failed to restore session', e)
      }
    }
    setLoading(false)

    // Setup axios interceptor for 401
    const id = axios.interceptors.response.use(
      (r) => r,
      (err) => {
        if (err?.response?.status === 401) {
          localStorage.removeItem('merchant_token')
          localStorage.removeItem('merchant_user')
          setUser(null)
        }
        return Promise.reject(err)
      }
    )
    return () => axios.interceptors.response.eject(id)
  }, [])

  const handleLogin = (userData, token) => {
    localStorage.setItem('merchant_token', token)
    localStorage.setItem('merchant_user', JSON.stringify(userData))
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.removeItem('merchant_token')
    localStorage.removeItem('merchant_user')
    setUser(null)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    )
  }

  if (!user) {
    return <MerchantLogin onLogin={handleLogin} />
  }

  return (
    <Router>
      <MerchantLayout user={user} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<MerchantDashboard user={user} />} />
          <Route path="/products" element={<MerchantProducts user={user} />} />
          <Route path="/orders" element={<MerchantOrders user={user} />} />
          <Route path="/profile" element={<MerchantProfile user={user} onLogout={handleLogout} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MerchantLayout>
    </Router>
  )
}

export default App

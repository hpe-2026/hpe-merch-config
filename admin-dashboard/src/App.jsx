import { useState, useEffect } from 'react'
import axios from 'axios'
import AdminNavbar from './components/AdminNavbar'
import AdminLogin from './components/AdminLogin'
import Dashboard from './components/Dashboard'
import MerchantDashboard from './components/MerchantDashboard'
import Metrics from './components/Metrics'
import Traces from './components/Traces'
import Users from './components/Users'
import Products from './components/Products'
import Orders from './components/Orders'
import AdminProfile from './components/AdminProfile'
import { ShieldCheck } from 'lucide-react'

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [user, setUser] = useState(null)

  // Auto-logout on any 401 from a protected endpoint (stale/expired token)
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (r) => r,
      (err) => {
        if (err?.response?.status === 401) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          setUser(null)
        }
        return Promise.reject(err)
      }
    )
    return () => axios.interceptors.response.eject(id)
  }, [])

  const MERCHANT_ROLES = ['merchant', 'merchant-amazon', 'merchant-flipkart']

  const isAdminUser = (u) =>
    u?.role === 'admin' ||
    u?.roles?.includes('admin') ||
    u?.roles?.includes('admin-internal')

  const isMerchantUser = (u) =>
    u?.role === 'merchant' ||
    u?.isMerchant ||
    u?.roles?.some(r => MERCHANT_ROLES.includes(r))

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')
    if (token && userData) {
      try {
        const parsed = JSON.parse(userData)
        if (parsed && (isAdminUser(parsed) || isMerchantUser(parsed))) {
          setUser(parsed)
          setCurrentPage(isMerchantUser(parsed) && !isAdminUser(parsed) ? 'merchant-dashboard' : 'dashboard')
        }
      } catch (e) {
        console.error('Failed to restore session', e)
      }
    }
  }, [])

  const handleLoginSuccess = (userData) => {
    setUser(userData)
    const merchantOnly = isMerchantUser(userData) && !isAdminUser(userData)
    setCurrentPage(merchantOnly ? 'merchant-dashboard' : 'dashboard')
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    setCurrentPage('dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {!user ? (
        <AdminLogin onLoginSuccess={handleLoginSuccess} />
      ) : (
        <>
          <AdminNavbar
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            user={user}
            onLogout={handleLogout}
          />

          <main className="flex-1">
            {currentPage === 'dashboard' && <Dashboard />}
            {currentPage === 'merchant-dashboard' && <MerchantDashboard user={user} setCurrentPage={setCurrentPage} />}
            {currentPage === 'metrics' && <Metrics />}
            {currentPage === 'traces' && <Traces />}
            {currentPage === 'users' && <Users />}
            {currentPage === 'products' && <Products user={user} />}
            {currentPage === 'orders' && <Orders user={user} />}
            {currentPage === 'profile' && <AdminProfile user={user} onLogout={handleLogout} />}
          </main>

          <footer className="border-t border-slate-200 bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5} />
                </div>
                <p className="text-sm text-slate-600">
                  © {new Date().getFullYear()} NITTE Admin Console
                </p>
              </div>
              <p className="text-xs text-slate-400">
                Internal use · Backed by MongoDB · Keycloak · Kafka
              </p>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}

export default App

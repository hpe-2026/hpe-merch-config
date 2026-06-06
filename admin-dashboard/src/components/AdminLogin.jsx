import { useState } from 'react'
import axios from 'axios'
import {
  Shield,
  ShieldCheck,
  Mail,
  Lock,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { API_BASE } from '../config/api'
import ThemeToggle from './ThemeToggle'

export default function AdminLogin({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({ email: '', password: '' })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((p) => ({ ...p, [name]: value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    let response = null
    try {
      response = await axios.post(`${API_BASE}/api/v1/admin/auth/login`, formData)

      const res = response.data
      const token = res.tokens?.access_token || res.token
      const roles =
        res.data?.roles ||
        res.user?.roles ||
        [res.data?.role || res.user?.role || 'user']

      const isAdmin = roles.includes('admin') ||
                       roles.includes('admin-internal') ||
                       roles.includes('platform-admin')

      const MERCHANT_ROLES = ['merchant', 'merchant-amazon', 'merchant-flipkart', 'merchant-admin', 'merchant-staff']
      const isMerchant = roles.some(r => MERCHANT_ROLES.includes(r))

      if (!token) {
        setError('Login failed. No token received.')
        return
      }
      if (!isAdmin && !isMerchant) {
        setError('Access denied. Admin or Merchant account required.')
        return
      }

      const userData = {
        userId: res.data?.user_id || res.user?.user_id || res.data?.userId || res.data?.id,
        email: res.data?.email || res.user?.email,
        name: res.data?.name || res.user?.name || (isAdmin ? 'Administrator' : 'Merchant'),
        role: isAdmin ? 'admin' : 'merchant',
        roles,
        isAdmin,
        isMerchant,
        profileImage: res.data?.profileImage || null,
        merchantId: res.data?.merchantId || res.data?.merchant_id || null,
        merchantName: res.data?.merchantName || null,
        phone: res.data?.phone || null,
        address: res.data?.address || null,
        description: res.data?.description || null,
      }

      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(userData))
      onLoginSuccess(userData)
    } catch (err) {
      setError(err.response?.data?.message || 'Admin login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-white" strokeWidth={2.25} />
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-tight text-slate-900">NITTE Admin</p>
              <p className="text-[11px] font-medium text-slate-500">Operations Console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Shield className="w-3.5 h-3.5" />
              Internal · Restricted
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex w-12 h-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm mb-4">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Sign in to Dashboard
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Platform administration console. Manage users, products, and system settings.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-7">
            {error && (
              <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="admin@nitte.edu"
                    required
                    disabled={loading}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                Authentication routes through Keycloak when available, with a JWT
                fallback for development.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} NITTE Alumni Association · Admin Console
          </p>
        </div>
      </main>
    </div>
  )
}

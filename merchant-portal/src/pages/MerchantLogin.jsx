import { useState } from 'react'
import axios from 'axios'
import { 
  Store, 
  Mail, 
  Lock, 
  AlertCircle, 
  Loader2,
  ArrowRight,
  Shield
} from 'lucide-react'
import { API_BASE } from '../config/api'
import ThemeToggle from '../components/ThemeToggle'

export default function MerchantLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await axios.post(`${API_BASE}/api/v1/admin/auth/login`, {
        email,
        password,
      })

      const { tokens, data, user } = response.data
      const token = tokens?.access_token || tokens?.token
      const userData = data || user

      if (!token) {
        setError('Login failed. No token received.')
        return
      }

      const roles = userData?.roles || (userData?.role ? [userData.role] : [])
      const hasMerchantRole = roles.some(r => 
        ['merchant', 'merchant-admin', 'merchant-staff', 'merchant-amazon', 'merchant-flipkart'].includes(r)
      )

      if (!hasMerchantRole) {
        setError('Access denied. This portal is for merchants only.')
        return
      }

      onLogin(userData, token)
    } catch (err) {
      setError(
        err.response?.data?.message || 
        'Login failed. Please check your credentials and try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black flex flex-col">
      {/* Top bar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center">
              <Store className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">NITTE Merchant</p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Vendor Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Shield className="w-3.5 h-3.5" />
              Secure Access
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex w-12 h-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm mb-4">
              <Store className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Merchant Sign In
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Manage products, orders, and your store profile
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-7">
            {error && (
              <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className={inputClass}
                    placeholder="merchant@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className={inputClass}
                    placeholder="••••••••"
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

            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                Authenticated via Keycloak. Contact your administrator for access.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            © {new Date().getFullYear()} NITTE Alumni Merchandise · Merchant Portal
          </p>
        </div>
      </main>
    </div>
  )
}

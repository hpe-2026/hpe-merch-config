import React, { useState } from 'react'
import axios from 'axios'
import {
  GraduationCap,
  ShieldCheck,
  Truck,
  Sparkles,
  ArrowRight,
  Mail,
  Lock,
  User as UserIcon,
  Hash,
  Building2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { API_BASE } from '../config/api'
import ThemeToggle from './ThemeToggle'

const Landing = ({ onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [loginData, setLoginData] = useState({ email: '', password: '' })
  const [userType, setUserType] = useState('alumni')
  const [signupData, setSignupData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    alumni_id: '',
    department: '',
    graduation_year: '',
  })

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await axios.post(`${API_BASE}/api/v1/auth/login`, loginData)
      const res = response.data
      const token = res.tokens?.access_token || res.token
      const user = res.data || res.user
      if (res.success && token) {
        localStorage.setItem('token', token)
        localStorage.setItem('user', JSON.stringify(user))
        if (onLoginSuccess) onLoginSuccess(user)
        window.location.reload()
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (signupData.password !== signupData.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const payload = {
        name: signupData.name,
        email: signupData.email,
        password: signupData.password,
        user_type: userType,
        ...(userType === 'alumni' && {
          alumni_id: signupData.alumni_id,
          department: signupData.department,
          graduation_year: signupData.graduation_year,
        }),
      }
      const response = await axios.post(`${API_BASE}/api/v1/auth/signup`, payload)
      if (response.data.success) {
        setSuccess('Registration successful. Your account is pending admin approval.')
        setSignupData({
          name: '', email: '', password: '', confirmPassword: '',
          alumni_id: '', department: '', graduation_year: '',
        })
        setUserType('alumni')
        setTimeout(() => { setActiveTab('login'); setSuccess('') }, 3000)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'

  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <GraduationCap className="w-7 h-7 text-white" strokeWidth={2.25} />
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-tight text-slate-900">NITTE Alumni</p>
              <p className="text-[11px] font-medium text-indigo-600">Official Merch Store</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a
              href="#auth"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Sign in
            </a>
          </div>
        </div>
      </header>

      {/* Hero + Auth split */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20 grid lg:grid-cols-2 gap-12 items-center">
        {/* Left: hero copy */}
        <div>
          <span className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-1 rounded-full">
            <Sparkles className="w-3.5 h-3.5" />
            Exclusively for verified alumni
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 leading-[1.1]">
            Wear your <span className="text-indigo-600">legacy.</span>
            <br />
            Carry the brand.
          </h1>
          <p className="mt-5 text-lg text-slate-600 max-w-xl leading-relaxed">
            Premium merchandise crafted for the NITTE alumni community —
            apparel, stationery and limited-edition collectibles, all in one
            place.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <a
              href="#auth"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 shadow-sm transition"
            >
              Get started
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-slate-900 font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 transition"
            >
              Why this store
            </a>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
            <div>
              <p className="text-2xl font-bold text-slate-900">2k+</p>
              <p className="text-xs text-slate-500 mt-1">Verified alumni</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">50+</p>
              <p className="text-xs text-slate-500 mt-1">Exclusive products</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">4.9★</p>
              <p className="text-xs text-slate-500 mt-1">Member rating</p>
            </div>
          </div>
        </div>

        {/* Right: auth card */}
        <div id="auth" className="lg:justify-self-end w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            {/* Tabs */}
            <div className="grid grid-cols-2 border-b border-slate-200">
              <button
                onClick={() => { setActiveTab('login'); setError(''); setSuccess('') }}
                className={`py-3.5 text-sm font-semibold transition ${
                  activeTab === 'login'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Sign in
              </button>
              <button
                onClick={() => { setActiveTab('signup'); setError(''); setSuccess('') }}
                className={`py-3.5 text-sm font-semibold transition ${
                  activeTab === 'signup'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Create account
              </button>
            </div>

            <div className="p-6 sm:p-7">
              {error && (
                <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              {success && (
                <div className="mb-4 flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-emerald-700">{success}</p>
                </div>
              )}

              {activeTab === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className={labelClass}>Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        placeholder="you@nitte.edu"
                        value={loginData.email}
                        onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
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
                        <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                      </>
                    ) : (
                      <>Sign in</>
                    )}
                  </button>

                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-2 text-slate-400">Demo access</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setLoginData({ email: 'admin@nitte.edu', password: 'admin@123' })}
                    className="w-full py-2.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200 transition"
                  >
                    Use admin demo credentials
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignup} className="space-y-4">
                  {/* User type toggle */}
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => setUserType('alumni')}
                      className={`flex-1 py-2 transition ${
                        userType === 'alumni'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Alumni
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserType('non_alumni')}
                      className={`flex-1 py-2 transition ${
                        userType === 'non_alumni'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Non-Alumni
                    </button>
                  </div>

                  <div>
                    <label className={labelClass}>Full name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Jane Doe"
                        value={signupData.name}
                        onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email"
                        placeholder="you@example.com"
                        value={signupData.email}
                        onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>
                  {userType === 'alumni' && (
                    <>
                      <div>
                        <label className={labelClass}>Alumni ID</label>
                        <div className="relative">
                          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            placeholder="NITTE-2020-001"
                            value={signupData.alumni_id}
                            onChange={(e) => setSignupData({ ...signupData, alumni_id: e.target.value })}
                            required
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Department</label>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select
                              value={signupData.department}
                              onChange={(e) => setSignupData({ ...signupData, department: e.target.value })}
                              required
                              className={inputClass + ' appearance-none'}
                            >
                              <option value="">Select</option>
                              <option value="CSE">CSE</option>
                              <option value="ECE">ECE</option>
                              <option value="MECH">MECH</option>
                              <option value="EEE">EEE</option>
                              <option value="CIVIL">CIVIL</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Grad. year</label>
                          <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                              type="number"
                              placeholder="2020"
                              value={signupData.graduation_year}
                              onChange={(e) => setSignupData({ ...signupData, graduation_year: e.target.value })}
                              required
                              className={inputClass}
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  <div>
                    <label className={labelClass}>Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={signupData.password}
                        onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Confirm password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={signupData.confirmPassword}
                        onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })}
                        required
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Creating account…
                      </>
                    ) : (
                      <>Create account</>
                    )}
                  </button>

                  <p className="text-xs text-slate-500 text-center pt-1">
                    New accounts require admin approval before shopping.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features strip */}
      <section id="features" className="bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
              Built for the alumni community
            </h2>
            <p className="mt-3 text-slate-600">
              Verified access, premium goods, and a checkout experience that
              just works.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: GraduationCap, title: 'Alumni-only', desc: 'Verified Alumni IDs unlock the catalog.' },
              { icon: Sparkles, title: 'Limited drops', desc: 'Curated, small-batch designs by alumni.' },
              { icon: Truck, title: 'Pan-India shipping', desc: 'Real-time tracking, 3–5 day delivery.' },
              { icon: ShieldCheck, title: 'Secure checkout', desc: 'Encrypted payments, multiple options.' },
            ].map((f) => (
              <div
                key={f.title}
                className="group p-6 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-200 hover:bg-white transition"
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center mb-4 group-hover:scale-105 transition">
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-slate-900">{f.title}</h3>
                <p className="text-sm text-slate-600 mt-1.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} NITTE Alumni Association
          </p>
          <p className="text-xs text-slate-400">
            Crafted for alumni, by alumni.
          </p>
        </div>
      </footer>
    </div>
  )
}

export default Landing

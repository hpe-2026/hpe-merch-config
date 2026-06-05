import { useEffect, useState } from 'react'
import axios from 'axios'
import { Package, ShoppingCart, TrendingUp, Store, ArrowRight, AlertCircle, UserCircle } from 'lucide-react'
import { API_BASE } from '../config/api'

const MERCHANT_ROLE_LABELS = {
  'merchant-amazon': 'Amazon',
  'merchant-flipkart': 'Flipkart',
  'merchant': 'Merchant',
  'merchant-admin': 'Merchant Admin',
  'merchant-staff': 'Merchant Staff',
}

function getMerchantLabel(user) {
  if (!user?.roles) return 'Merchant'
  for (const role of user.roles) {
    if (MERCHANT_ROLE_LABELS[role]) return MERCHANT_ROLE_LABELS[role]
  }
  return 'Merchant'
}

export default function MerchantDashboard({ user, setCurrentPage }) {
  const [stats, setStats] = useState({ products: 0, orders: 0, revenue: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const auth = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
  })

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true)
      try {
        const [productsRes, ordersRes] = await Promise.allSettled([
          axios.get(`${API_BASE}/api/v1/products`, auth()),
          axios.get(`${API_BASE}/api/v1/orders`, auth()),
        ])

        const products = productsRes.status === 'fulfilled'
          ? (productsRes.value.data?.data || productsRes.value.data || [])
          : []

        const orders = ordersRes.status === 'fulfilled'
          ? (ordersRes.value.data?.data || ordersRes.value.data || [])
          : []

        const revenue = orders.reduce((sum, o) => sum + (o.total_amount || o.totalAmount || 0), 0)

        setStats({ products: products.length, orders: orders.length, revenue })
        setError(null)
      } catch (err) {
        setError('Failed to load merchant stats')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  const merchantLabel = getMerchantLabel(user)

  const statCards = [
    {
      label: 'Total Products',
      value: stats.products,
      icon: Package,
      color: 'bg-indigo-50 text-indigo-600',
      page: 'products',
    },
    {
      label: 'Total Orders',
      value: stats.orders,
      icon: ShoppingCart,
      color: 'bg-emerald-50 text-emerald-600',
      page: 'orders',
    },
    {
      label: 'Revenue',
      value: `₹${stats.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      color: 'bg-amber-50 text-amber-600',
      page: null,
    },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Welcome banner */}
      <div className="mb-8 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow">
          <Store className="w-7 h-7 text-white" strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Welcome, {user?.name || merchantLabel}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {merchantLabel} Partner Portal · {user?.email}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className={`bg-white border border-slate-200 rounded-xl p-5 shadow-sm ${card.page ? 'cursor-pointer hover:shadow-md transition' : ''}`}
              onClick={() => card.page && setCurrentPage(card.page)}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-500">{card.label}</span>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.color}`}>
                  <Icon className="w-4 h-4" strokeWidth={2} />
                </div>
              </div>
              {loading ? (
                <div className="h-7 w-16 bg-slate-100 rounded animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-slate-900">{card.value}</p>
              )}
              {card.page && (
                <p className="text-xs text-indigo-600 mt-1 flex items-center gap-0.5">
                  View all <ArrowRight className="w-3 h-3" />
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Quick actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setCurrentPage('products')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
          >
            <Package className="w-4 h-4" />
            Manage Products
          </button>
          <button
            onClick={() => setCurrentPage('orders')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition"
          >
            <ShoppingCart className="w-4 h-4" />
            View Orders
          </button>
          <button
            onClick={() => setCurrentPage('merchant-profile')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition"
          >
            <UserCircle className="w-4 h-4" />
            My Profile
          </button>
        </div>
      </div>

    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import {
  Package,
  ShoppingCart,
  IndianRupee,
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts'
import axios from 'axios'
import { API_BASE } from '../config/api'

const fmtINR = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN')

const STATUS_META = {
  pending:    { label: 'Pending',    text: 'text-amber-700',   dot: 'bg-amber-500'   },
  processing: { label: 'Processing', text: 'text-blue-700',    dot: 'bg-blue-500'    },
  shipped:    { label: 'Shipped',    text: 'text-violet-700',  dot: 'bg-violet-500'  },
  delivered:  { label: 'Delivered',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled:  { label: 'Cancelled',  text: 'text-red-700',     dot: 'bg-red-500'     },
}

export default function Dashboard() {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [verificationStats, setVerificationStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 })
  const [apiLatencyMs, setApiLatencyMs] = useState(null)
  const [apiHealthy, setApiHealthy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 15000)
    return () => clearInterval(t)
  }, [])

  const fetchAll = async () => {
    const token = localStorage.getItem('token')
    const auth = { headers: { Authorization: `Bearer ${token}` } }

    await Promise.all([
      // Products
      axios.get(`${API_BASE}/api/v1/products`, auth)
        .then((r) => setProducts(r.data.data || r.data || []))
        .catch(() => {}),
      // Orders
      axios.get(`${API_BASE}/api/v1/orders`, auth)
        .then((r) => setOrders(r.data.data || r.data || []))
        .catch(() => {}),
      // Verification stats — backend returns either an object
      // { pending, approved, rejected, total } or a Mongo aggregate
      // [ { _id: 'approved', count: 2 }, ... ]
      axios.get(`${API_BASE}/api/v1/admin/users/stats/verification`, auth)
        .then((r) => {
          const raw = r.data.data ?? r.data ?? {}
          let normalized = { pending: 0, approved: 0, rejected: 0, total: 0 }
          if (Array.isArray(raw)) {
            raw.forEach((row) => {
              const key = (row._id || '').toLowerCase()
              if (key in normalized) normalized[key] = row.count || 0
            })
          } else if (typeof raw === 'object') {
            normalized = {
              pending: raw.pending ?? 0,
              approved: raw.approved ?? 0,
              rejected: raw.rejected ?? 0,
              total: raw.total ?? 0,
            }
          }
          if (!normalized.total) {
            normalized.total = normalized.pending + normalized.approved + normalized.rejected
          }
          setVerificationStats(normalized)
        })
        .catch(() => {}),
      // Real API latency from /health
      (async () => {
        const t0 = performance.now()
        try {
          const r = await axios.get(`${API_BASE}/api/v1/health`, { timeout: 5000 })
          const ms = Math.round(performance.now() - t0)
          setApiLatencyMs(ms)
          setApiHealthy(r.status === 200)
        } catch {
          setApiHealthy(false)
          setApiLatencyMs(null)
        }
      })(),
    ])

    setLoading(false)
  }

  // ---- derived metrics from real data ----
  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, o) => {
      if (typeof o.totalAmount === 'number') return sum + o.totalAmount
      const items = o.items || []
      return sum + items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0)
    }, 0)
  }, [orders])

  const activeUsers = useMemo(() => new Set(orders.map((o) => o.user_id || o.userId)).size, [orders])

  // Last 7 days timeseries
  const last7Series = useMemo(() => {
    const days = []
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      d.setHours(0, 0, 0, 0)
      days.push({ date: d, label: d.toLocaleDateString('en-IN', { weekday: 'short' }), orders: 0, revenue: 0 })
    }

    orders.forEach((o) => {
      const ts = o.createdAt || o.created_at
      if (!ts) return
      const d = new Date(ts)
      d.setHours(0, 0, 0, 0)
      const bucket = days.find((b) => b.date.getTime() === d.getTime())
      if (!bucket) return
      bucket.orders += 1
      const total = typeof o.totalAmount === 'number'
        ? o.totalAmount
        : (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0)
      bucket.revenue += total
    })

    return days.map(({ label, orders, revenue }) => ({ label, orders, revenue }))
  }, [orders])

  // Week-over-week change %
  const weekChange = useMemo(() => {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    let thisWeek = 0
    let lastWeek = 0
    let thisRev = 0
    let lastRev = 0
    orders.forEach((o) => {
      const ts = new Date(o.createdAt || o.created_at || 0).getTime()
      const total = typeof o.totalAmount === 'number'
        ? o.totalAmount
        : (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0)
      if (ts >= now - 7 * day) { thisWeek++; thisRev += total }
      else if (ts >= now - 14 * day) { lastWeek++; lastRev += total }
    })
    const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0))
    return {
      orders: pct(thisWeek, lastWeek),
      revenue: pct(thisRev, lastRev),
    }
  }, [orders])

  // Order status breakdown
  const statusBreakdown = useMemo(() => {
    const map = { pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 }
    orders.forEach((o) => {
      const s = (o.status || 'pending').toLowerCase()
      if (map[s] !== undefined) map[s]++
    })
    return Object.entries(map).map(([k, v]) => ({ name: STATUS_META[k]?.label || k, value: v, key: k }))
  }, [orders])

  // Top categories
  const topCategories = useMemo(() => {
    const map = {}
    products.forEach((p) => {
      const c = (p.category || 'uncategorized').toLowerCase()
      map[c] = (map[c] || 0) + 1
    })
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [products])

  // Low stock
  const lowStock = useMemo(
    () => products.filter((p) => (p.stock ?? 0) <= 10).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0)).slice(0, 5),
    [products]
  )

  // Recent orders
  const recentOrders = useMemo(() => {
    return [...orders]
      .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))
      .slice(0, 6)
  }, [orders])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">
            Overview
          </p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
            Admin dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Real-time view of catalog, fulfillment, and verification activity.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${apiHealthy ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            <Activity className="w-3 h-3" />
            API {apiHealthy ? 'healthy' : 'unreachable'}
          </span>
          {apiLatencyMs != null && (
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
              {apiLatencyMs}ms
            </span>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={Package}
          label="Catalog products"
          value={fmtNum(products.length)}
          hint={lowStock.length > 0 ? `${lowStock.length} low stock` : 'Stock healthy'}
          hintTone={lowStock.length > 0 ? 'warn' : 'good'}
        />
        <KpiCard
          icon={ShoppingCart}
          label="Total orders"
          value={fmtNum(orders.length)}
          change={weekChange.orders}
          hint="vs. previous 7 days"
        />
        <KpiCard
          icon={IndianRupee}
          label="Revenue (all-time)"
          value={fmtINR(totalRevenue)}
          change={weekChange.revenue}
          hint="vs. previous 7 days"
        />
        <KpiCard
          icon={Users}
          label="Pending approvals"
          value={fmtNum(verificationStats.pending)}
          hint={`${verificationStats.approved} approved · ${verificationStats.rejected} rejected`}
        />
      </div>

      {/* Main split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Orders/revenue chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Orders and revenue · last 7 days</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Aggregated from real order timestamps in MongoDB.
              </p>
            </div>
          </div>

          {orders.length === 0 ? (
            <EmptyChart label="No orders yet — chart will populate after the first order." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={last7Series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(v, k) => k === 'revenue' ? [fmtINR(v), 'Revenue'] : [v, 'Orders']}
                />
                <Area type="monotone" dataKey="orders" stroke="#6366f1" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Order status breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Order status</h2>
          <p className="text-xs text-slate-500 mb-4">Live breakdown by fulfillment state.</p>

          {orders.length === 0 ? (
            <EmptyChart small label="Waiting for orders…" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusBreakdown} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={80} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Bottom split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Recent orders */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Recent orders</h2>
          </div>
          {recentOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No orders yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Order</th>
                  <th className="text-left px-5 py-2.5 font-medium">Customer</th>
                  <th className="text-right px-5 py-2.5 font-medium">Total</th>
                  <th className="text-center px-5 py-2.5 font-medium">Status</th>
                  <th className="text-right px-5 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => {
                  const total = typeof o.totalAmount === 'number'
                    ? o.totalAmount
                    : (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0)
                  const meta = STATUS_META[(o.status || 'pending').toLowerCase()] || STATUS_META.pending
                  return (
                    <tr key={o._id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">
                        {o._id?.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{o.customerName || '—'}</p>
                        <p className="text-xs text-slate-500">{o.customerEmail || ''}</p>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900">{fmtINR(total)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-slate-500">
                        {o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Verification snapshot */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Verification queue</h2>
          <VerifRow icon={Clock} tone="amber" label="Pending review" value={verificationStats.pending} />
          <VerifRow icon={CheckCircle2} tone="emerald" label="Approved" value={verificationStats.approved} />
          <VerifRow icon={AlertTriangle} tone="red" label="Rejected" value={verificationStats.rejected} />

          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-1">Total submissions</p>
            <p className="text-2xl font-bold text-slate-900">{fmtNum(verificationStats.total)}</p>
          </div>
        </div>
      </div>

      {/* Catalog insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Top categories</h2>
          {topCategories.length === 0 ? (
            <p className="text-sm text-slate-500">No products in catalog.</p>
          ) : (
            <ul className="space-y-3">
              {topCategories.map((c) => {
                const max = topCategories[0].count || 1
                const pct = Math.round((c.count / max) * 100)
                return (
                  <li key={c.name}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-sm font-medium text-slate-700 capitalize">{c.name}</span>
                      <span className="text-xs text-slate-500">{c.count} item{c.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Low stock alerts</h2>
            <span className="text-xs text-slate-500">≤ 10 units</span>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-emerald-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> All products are well-stocked.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStock.map((p) => (
                <li key={p._id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900 line-clamp-1">{p.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{p.category || 'uncategorized'}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    (p.stock ?? 0) === 0 ? 'text-red-700' : 'text-amber-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      (p.stock ?? 0) === 0 ? 'bg-red-500' : 'bg-amber-500'
                    }`} />
                    {(p.stock ?? 0) === 0 ? 'Out of stock' : `${p.stock} left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, change, hint, hintTone }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <Icon className="w-4.5 h-4.5" />
        </div>
        {typeof change === 'number' && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
      {hint && (
        <p className={`mt-1 text-xs ${
          hintTone === 'warn' ? 'text-amber-600' : hintTone === 'good' ? 'text-emerald-600' : 'text-slate-500'
        }`}>
          {hint}
        </p>
      )}
    </div>
  )
}

function VerifRow({ icon: Icon, tone, label, value }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          <Icon className="w-4 h-4" />
        </span>
        <span className="text-sm text-slate-700">{label}</span>
      </div>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  )
}

function EmptyChart({ label, small }) {
  return (
    <div className={`flex items-center justify-center text-sm text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200 ${small ? 'h-44' : 'h-60'}`}>
      {label}
    </div>
  )
}

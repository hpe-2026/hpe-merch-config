import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Package,
  ShoppingCart,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  Truck,
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
import { API_BASE, auth } from '../config/api'

const fmtINR = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN')

const STATUS_META = {
  pending:    { label: 'Pending',    dot: 'bg-amber-500',   text: 'text-amber-700' },
  confirmed:  { label: 'Confirmed',  dot: 'bg-blue-500',    text: 'text-blue-700' },
  shipped:    { label: 'Shipped',    dot: 'bg-violet-500',  text: 'text-violet-700' },
  delivered:  { label: 'Delivered',  dot: 'bg-emerald-500', text: 'text-emerald-700' },
  cancelled:  { label: 'Cancelled',  dot: 'bg-red-500',     text: 'text-red-700' },
}

export default function MerchantDashboard({ user }) {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    await Promise.all([
      axios.get(`${API_BASE}/api/v1/products`, auth())
        .then((r) => setProducts(r.data.data || r.data || []))
        .catch(() => {}),
      axios.get(`${API_BASE}/api/v1/orders`, auth())
        .then((r) => setOrders(r.data.data || r.data || []))
        .catch(() => {}),
    ])
    setLoading(false)
  }

  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, o) => {
      if (o.total_amount) return sum + o.total_amount
      return sum + (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)
    }, 0)
  }, [orders])

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
      const ts = o.created_at || o.createdAt
      if (!ts) return
      const d = new Date(ts)
      d.setHours(0, 0, 0, 0)
      const bucket = days.find((b) => b.date.getTime() === d.getTime())
      if (!bucket) return
      bucket.orders += 1
      bucket.revenue += (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)
    })
    return days.map(({ label, orders, revenue }) => ({ label, orders, revenue }))
  }, [orders])

  // Week-over-week change
  const weekChange = useMemo(() => {
    const now = Date.now()
    const day = 86400000
    let thisWeek = 0, lastWeek = 0, thisRev = 0, lastRev = 0
    orders.forEach((o) => {
      const ts = new Date(o.created_at || o.createdAt || 0).getTime()
      const total = (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)
      if (ts >= now - 7 * day) { thisWeek++; thisRev += total }
      else if (ts >= now - 14 * day) { lastWeek++; lastRev += total }
    })
    const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : 0))
    return { orders: pct(thisWeek, lastWeek), revenue: pct(thisRev, lastRev) }
  }, [orders])

  // Status breakdown
  const statusBreakdown = useMemo(() => {
    const map = { pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 }
    orders.forEach((o) => {
      const s = (o.status || 'pending').toLowerCase()
      if (map[s] !== undefined) map[s]++
    })
    return Object.entries(map).map(([k, v]) => ({ name: STATUS_META[k]?.label || k, value: v }))
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
      .sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0))
      .slice(0, 5)
  }, [orders])

  const pendingCount = orders.filter(o => (o.status || 'pending') === 'pending').length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Overview</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Welcome back, {user?.name || 'Merchant'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700">
            <Activity className="w-3 h-3" />
            Store active
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={Package}
          label="Products"
          value={fmtNum(products.length)}
          hint={lowStock.length > 0 ? `${lowStock.length} low stock` : 'Stock healthy'}
          hintTone={lowStock.length > 0 ? 'warn' : 'good'}
          href="/products"
        />
        <KpiCard
          icon={ShoppingCart}
          label="Total orders"
          value={fmtNum(orders.length)}
          change={weekChange.orders}
          hint="vs. previous 7 days"
          href="/orders"
        />
        <KpiCard
          icon={IndianRupee}
          label="Revenue"
          value={fmtINR(totalRevenue)}
          change={weekChange.revenue}
          hint="vs. previous 7 days"
          href="/orders"
        />
        <KpiCard
          icon={Truck}
          label="Pending fulfillment"
          value={fmtNum(pendingCount)}
          hint={`${orders.length - pendingCount} fulfilled`}
          hintTone={pendingCount > 0 ? 'warn' : 'good'}
          href="/orders"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Revenue chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Orders & revenue · last 7 days</h2>
          <p className="text-xs text-slate-500 mb-4">Daily order volume and revenue trend.</p>

          {orders.length === 0 ? (
            <EmptyChart label="No orders yet — chart populates after first sale." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={last7Series} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gMerch" x1="0" y1="0" x2="0" y2="1">
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
                <Area type="monotone" dataKey="orders" stroke="#6366f1" strokeWidth={2} fill="url(#gMerch)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Order status breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Order status</h2>
          <p className="text-xs text-slate-500 mb-4">Fulfillment breakdown.</p>

          {orders.length === 0 ? (
            <EmptyChart small label="Waiting for orders…" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
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

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent orders</h2>
            <Link to="/orders" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
              View all →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No orders yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Order</th>
                  <th className="text-left px-5 py-2.5 font-medium">Customer</th>
                  <th className="text-right px-5 py-2.5 font-medium">Total</th>
                  <th className="text-center px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => {
                  const total = (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)
                  const meta = STATUS_META[(o.status || 'pending').toLowerCase()] || STATUS_META.pending
                  return (
                    <tr key={o._id || o.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-5 py-3 font-medium text-slate-900">{o.order_id || (o._id || '').slice(-8)}</td>
                      <td className="px-5 py-3 text-slate-600 text-xs">{o.user_email || '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-900">{fmtINR(total)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Inventory insights */}
        <div className="space-y-6">
          {/* Top categories */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Top categories</h2>
            {topCategories.length === 0 ? (
              <p className="text-sm text-slate-500">No products yet.</p>
            ) : (
              <ul className="space-y-3">
                {topCategories.map((c) => {
                  const max = topCategories[0].count || 1
                  const pct = Math.round((c.count / max) * 100)
                  return (
                    <li key={c.name}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm font-medium text-slate-700 capitalize">{c.name}</span>
                        <span className="text-xs text-slate-500">{c.count}</span>
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

          {/* Low stock */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-900">Low stock</h2>
              <span className="text-xs text-slate-500">≤ 10 units</span>
            </div>
            {lowStock.length === 0 ? (
              <p className="text-sm text-emerald-600 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> All stocked up!
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lowStock.map((p) => (
                  <li key={p._id || p.id} className="py-2.5 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900 line-clamp-1">{p.name}</p>
                    <span className={`text-xs font-medium ${(p.stock ?? 0) === 0 ? 'text-red-700' : 'text-amber-700'}`}>
                      {(p.stock ?? 0) === 0 ? 'Out' : `${p.stock} left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, change, hint, hintTone, href }) {
  const Wrapper = href ? Link : 'div'
  const props = href ? { to: href } : {}
  return (
    <Wrapper {...props} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition">
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
        <p className={`mt-1 text-xs ${hintTone === 'warn' ? 'text-amber-600' : hintTone === 'good' ? 'text-emerald-600' : 'text-slate-500'}`}>
          {hint}
        </p>
      )}
    </Wrapper>
  )
}

function EmptyChart({ label, small }) {
  return (
    <div className={`flex items-center justify-center text-sm text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200 ${small ? 'h-40' : 'h-56'}`}>
      {label}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { ShoppingCart, AlertCircle, Loader2, Search, RefreshCw, ChevronDown, Check } from 'lucide-react'
import { API_BASE, auth } from '../config/api'

const STATUS_META = {
  pending:    { label: 'Pending',    dot: 'bg-amber-500',   text: 'text-amber-700',   ring: 'ring-amber-200' },
  confirmed:  { label: 'Confirmed',  dot: 'bg-blue-500',    text: 'text-blue-700',    ring: 'ring-blue-200' },
  shipped:    { label: 'Shipped',    dot: 'bg-violet-500',  text: 'text-violet-700',  ring: 'ring-violet-200' },
  delivered:  { label: 'Delivered',  dot: 'bg-emerald-500', text: 'text-emerald-700', ring: 'ring-emerald-200' },
  cancelled:  { label: 'Cancelled',  dot: 'bg-red-500',     text: 'text-red-700',     ring: 'ring-red-200' },
}
const STATUSES = Object.keys(STATUS_META)

function StatusMenu({ status, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const meta = STATUS_META[status] || STATUS_META.pending

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={`inline-flex items-center gap-2 px-2.5 py-1 text-xs font-medium rounded-full bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition ${meta.text} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 origin-top-right rounded-lg bg-white border border-slate-200 shadow-lg overflow-hidden">
          <ul className="py-1">
            {STATUSES.map((s) => {
              const m = STATUS_META[s]
              const active = s === status
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); if (s !== status) onChange(s) }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-slate-50 ${active ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                      {m.label}
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function MerchantOrders({ user }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [updating, setUpdating] = useState(null)

  useEffect(() => { fetchOrders() }, [])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const res = await axios.get(`${API_BASE}/api/v1/orders`, auth())
      setOrders(res.data.data || res.data || [])
      setError(null)
    } catch (err) {
      setError('Failed to load orders')
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (orderId, newStatus) => {
    setUpdating(orderId)
    setError(null)
    try {
      await axios.put(`${API_BASE}/api/v1/orders/${orderId}`, { status: newStatus }, auth())
      setOrders(prev =>
        prev.map(o => (o._id === orderId || o.id === orderId) ? { ...o, status: newStatus } : o)
      )
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update order status')
    } finally {
      setUpdating(null)
    }
  }

  const counts = useMemo(() => {
    const c = { all: orders.length, pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 }
    orders.forEach((o) => {
      const s = (o.status || 'pending').toLowerCase()
      if (c[s] !== undefined) c[s]++
    })
    return c
  }, [orders])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      const status = (o.status || 'pending').toLowerCase()
      const okStatus = filter === 'all' || status === filter
      const okQ = !q
        || o._id?.toLowerCase().includes(q)
        || o.order_id?.toLowerCase().includes(q)
        || o.user_email?.toLowerCase().includes(q)
      return okStatus && okQ
    })
  }, [orders, filter, query])

  const orderTotal = (o) =>
    o.total_amount || (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)

  const fmtINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

  const tabs = [
    { id: 'all', label: 'All' },
    ...STATUSES.map((s) => ({ id: s, label: STATUS_META[s].label })),
  ]

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Fulfillment</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Orders</h1>
          <p className="text-sm text-slate-500 mt-0.5">{orders.length} total · {counts.pending} awaiting action</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order or customer"
              className="pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
            />
          </div>
          <button
            onClick={fetchOrders}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto -mx-1 px-1">
        {tabs.map((t) => {
          const active = filter === t.id
          return (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                active ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                {counts[t.id]}
              </span>
            </button>
          )
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-visible">
        {loading ? (
          <div className="py-12 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading orders…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500">
            <ShoppingCart className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm">No orders match these filters.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Order</th>
                <th className="text-left px-5 py-3 font-medium">Customer</th>
                <th className="text-left px-5 py-3 font-medium">Items</th>
                <th className="text-right px-5 py-3 font-medium">Total</th>
                <th className="text-center px-5 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const id = o._id || o.id
                const status = (o.status || 'pending').toLowerCase()
                return (
                  <tr key={id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{o.order_id || id?.slice(-8).toUpperCase()}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{o.user_email?.split('@')[0] || '—'}</p>
                      <p className="text-xs text-slate-500">{o.user_email || ''}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      <p className="text-xs">{o.items?.length || 0} item{(o.items?.length || 0) !== 1 ? 's' : ''}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                      {fmtINR(orderTotal(o))}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <StatusMenu
                        status={status}
                        onChange={(next) => updateStatus(id, next)}
                        disabled={updating === id}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-right text-xs text-slate-500">
                      {(o.created_at || o.createdAt)
                        ? new Date(o.created_at || o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

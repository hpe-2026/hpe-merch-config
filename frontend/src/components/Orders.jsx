import { useState, useEffect } from 'react'
import {
  Package,
  AlertCircle,
  Loader2,
  Clock,
  Truck,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MapPin,
} from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config/api'
import { useAuthStore } from '../features/auth/store/authStore'
import { useProductStore } from '../features/products/store/productStore'

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const token = useAuthStore(state => state.token)
  const getProductById = useProductStore((s) => s.getProductById)
  const productsLoaded = useProductStore((s) => s.products.length > 0)
  const fetchProducts = useProductStore((s) => s.fetchProducts)

  const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

  useEffect(() => {
    fetchOrders()
    if (!productsLoaded) fetchProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      
      if (!token) {
        setError('Please log in to view orders')
        setLoading(false)
        return
      }

      const response = await axios.get(`${API_BASE}/api/v1/orders`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      setOrders(response.data.data || response.data || [])
      setError(null)
    } catch (err) {
      setError('Failed to load orders. ' + (err.response?.data?.message || err.message))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const statusMeta = {
    pending:    { label: 'Pending',    Icon: Clock,        cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    confirmed:  { label: 'Confirmed',  Icon: CheckCircle2, cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    processing: { label: 'Processing', Icon: RefreshCw,    cls: 'bg-violet-50 text-violet-700 border-violet-200' },
    shipped:    { label: 'Shipped',    Icon: Truck,        cls: 'bg-sky-50 text-sky-700 border-sky-200' },
    delivered:  { label: 'Delivered',  Icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    cancelled:  { label: 'Cancelled',  Icon: XCircle,      cls: 'bg-red-50 text-red-700 border-red-200' },
  }
  const getStatus = (status) => statusMeta[status] || statusMeta.pending

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading your orders…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-5 bg-red-50 border border-red-200 rounded-xl flex gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-red-900">Couldn't load orders</h3>
          <p className="text-sm text-red-700 mt-1">{error}</p>
          <button
            onClick={fetchOrders}
            className="mt-3 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-5">
          <Package className="w-7 h-7 text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">No orders yet</h2>
        <p className="mt-2 text-sm text-slate-500">
          Once you place an order, it'll appear here so you can track its progress.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">My Account</p>
        <h2 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">Your orders</h2>
        <p className="mt-2 text-sm text-slate-500">
          {orders.length} {orders.length === 1 ? 'order' : 'orders'} · newest first
        </p>
      </div>

      <div className="space-y-4">
        {orders.map((order) => {
          const total = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
          const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
          const { label, Icon, cls } = getStatus(order.status)
          const created = order.created_at ? new Date(order.created_at) : null
          return (
            <article
              key={order.id || order._id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden"
            >
              {/* Header strip */}
              <header className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                    <Package className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">Order</p>
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      #{order.order_id || (order._id || '').slice(-8) || 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {created && (
                    <p className="hidden sm:block text-xs text-slate-500">
                      {created.toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      {' · '}
                      {created.toLocaleTimeString(undefined, { timeStyle: 'short' })}
                    </p>
                  )}
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${cls}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </span>
                </div>
              </header>

              {/* Items */}
              <ul className="divide-y divide-slate-100">
                {order.items && order.items.length > 0 ? (
                  order.items.map((item, idx) => {
                    const product = getProductById && getProductById(item.product_id)
                    const name = product?.name || item.name || 'Product'
                    return (
                      <li key={idx} className="px-5 py-3 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                          {product?.image_url ? (
                            <img
                              src={product.image_url}
                              alt={name}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm font-bold">
                              {name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
                          <p className="text-xs text-slate-500">
                            {fmt(item.price)} × {item.quantity}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">
                          {fmt(item.price * item.quantity)}
                        </p>
                      </li>
                    )
                  })
                ) : (
                  <li className="px-5 py-4 text-sm text-slate-500">No items</li>
                )}
              </ul>

              {/* Footer */}
              <footer className="px-5 py-4 border-t border-slate-200 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  {order.shipping_address && (
                    <p className="text-xs text-slate-500 flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span className="truncate">{order.shipping_address}</span>
                    </p>
                  )}
                  {order.notes && (
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-600">Notes:</span> {order.notes}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">{itemCount} {itemCount === 1 ? 'item' : 'items'} · Total</p>
                  <p className="text-lg font-bold text-slate-900">{fmt(total)}</p>
                </div>
              </footer>
            </article>
          )
        })}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import axios from 'axios'
import { ShoppingCart, AlertCircle, Loader2, ChevronDown } from 'lucide-react'
import { API_BASE, auth } from '../config/api'

const STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

export default function MerchantOrders({ user }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updating, setUpdating] = useState(null)

  useEffect(() => {
    fetchOrders()
  }, [])

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
      await axios.put(
        `${API_BASE}/api/v1/orders/${orderId}`,
        { status: newStatus },
        auth()
      )
      setOrders(prev =>
        prev.map(o =>
          (o._id === orderId || o.id === orderId) ? { ...o, status: newStatus } : o
        )
      )
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update order status')
    } finally {
      setUpdating(null)
    }
  }

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'shipped':
        return 'bg-violet-50 text-violet-700 border-violet-200'
      case 'completed':
      case 'delivered':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200'
      case 'cancelled':
        return 'bg-red-50 text-red-700 border-red-200'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200'
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Sales</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Orders</h1>
        <p className="text-sm text-slate-500 mt-0.5">{orders.length} orders received</p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-1">No orders yet</h3>
          <p className="text-sm text-slate-500">Orders will appear here when customers make purchases</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Order ID</th>
                <th className="text-left px-5 py-3 font-medium">Customer</th>
                <th className="text-right px-5 py-3 font-medium">Items</th>
                <th className="text-center px-5 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => {
                const id = order._id || order.id
                const totalAmount = order.total_amount || order.items?.reduce((sum, i) => sum + (i.price * i.quantity), 0) || 0
                return (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">{order.order_id || id}</p>
                      <p className="text-xs text-slate-400 mt-0.5">₹{totalAmount.toLocaleString('en-IN')}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {order.user_email || 'Unknown'}
                    </td>
                    <td className="px-5 py-4 text-right text-slate-600">
                      {order.items?.length || 0} items
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="inline-flex items-center relative">
                        <select
                          value={order.status || 'pending'}
                          onChange={(e) => updateStatus(id, e.target.value)}
                          disabled={updating === id}
                          className={`appearance-none pl-3 pr-7 py-1.5 text-xs font-medium rounded-full border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 ${getStatusColor(order.status)} ${updating === id ? 'opacity-50' : ''}`}
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-3 h-3 absolute right-2 pointer-events-none text-current opacity-60" />
                        {updating === id && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 ml-2" />
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right text-slate-500">
                      {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

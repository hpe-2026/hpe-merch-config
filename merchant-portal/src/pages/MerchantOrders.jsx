import { useEffect, useState } from 'react'
import axios from 'axios'
import { ShoppingCart, AlertCircle, Loader2 } from 'lucide-react'
import { API_BASE, auth } from '../config/api'

export default function MerchantOrders({ user }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'delivered':
        return 'bg-emerald-50 text-emerald-700'
      case 'pending':
        return 'bg-amber-50 text-amber-700'
      case 'cancelled':
        return 'bg-red-50 text-red-700'
      default:
        return 'bg-slate-50 text-slate-700'
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
                <th className="text-right px-5 py-3 font-medium">Amount</th>
                <th className="text-center px-5 py-3 font-medium">Status</th>
                <th className="text-right px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {orders.map((order) => (
                <tr key={order.id || order._id} className="hover:bg-slate-50">
                  <td className="px-5 py-4 font-medium text-slate-900">
                    {order.order_id || order.id}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {order.user_email || order.customer_email || 'Unknown'}
                  </td>
                  <td className="px-5 py-4 text-right font-medium text-slate-900">
                    ₹{order.total_amount?.toLocaleString('en-IN') || '0.00'}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                      {order.status || 'Pending'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-slate-500">
                    {new Date(order.created_at).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

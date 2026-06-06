import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  ArrowRight,
  AlertCircle,
  Loader2
} from 'lucide-react'
import { API_BASE, auth } from '../config/api'

export default function MerchantDashboard({ user }) {
  const [stats, setStats] = useState({ products: 0, orders: 0, revenue: 0 })
  const [recentProducts, setRecentProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      
      // Fetch products - backend filters by merchant_id
      const productsRes = await axios.get(`${API_BASE}/api/v1/products`, auth())
      const myProducts = productsRes.data.data || productsRes.data || []

      // Fetch orders
      const ordersRes = await axios.get(`${API_BASE}/api/v1/orders`, auth())
      const allOrders = ordersRes.data.data || ordersRes.data || []
      
      // Calculate stats
      const revenue = allOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

      setStats({
        products: myProducts.length,
        orders: allOrders.length,
        revenue
      })

      setRecentProducts(myProducts.slice(0, 5))
      setError(null)
    } catch (err) {
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      name: 'Products',
      value: stats.products,
      icon: Package,
      href: '/products',
      color: 'bg-indigo-50 text-indigo-600',
    },
    {
      name: 'Orders',
      value: stats.orders,
      icon: ShoppingCart,
      href: '/orders',
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      name: 'Revenue',
      value: `₹${stats.revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      href: '/orders',
      color: 'bg-amber-50 text-amber-600',
    },
  ]

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Welcome back, {user?.name || user?.merchantName || 'Merchant'}
        </p>
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
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {statCards.map((stat) => {
              const Icon = stat.icon
              return (
                <Link
                  key={stat.name}
                  to={stat.href}
                  className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-500">{stat.name}</p>
                      <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-sm text-indigo-600">
                    <span>View details</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Recent Products */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Recent Products</h2>
              <Link to="/products" className="text-sm text-indigo-600 hover:text-indigo-700">
                View all
              </Link>
            </div>

            {recentProducts.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No products yet. Add your first product!</p>
            ) : (
              <div className="space-y-3">
                {recentProducts.map((product) => (
                  <div key={product.id || product._id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                    <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-slate-200">
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <Package className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{product.name}</p>
                      <p className="text-sm text-slate-500">{product.category}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-slate-900">₹{product.price}</p>
                      <p className={`text-xs ${product.stock > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {product.stock} in stock
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

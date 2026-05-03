import { useState, useEffect } from 'react'
import { Trash2, ShoppingBag, AlertCircle, CheckCircle2, Minus, Plus, Loader2, CreditCard } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config/api'
import { useAuthStore } from '../features/auth/store/authStore'
import { useCartStore } from '../features/cart/store/cartStore'

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (document.getElementById('razorpay-sdk')) return resolve(true)
    const script = document.createElement('script')
    script.id = 'razorpay-sdk'
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function Cart({ cartItems, onRemove, onUpdateQuantity, setCart, setCurrentPage }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const token = useAuthStore(state => state.token)
  const user = useAuthStore(state => state.user)
  const clearCart = useCartStore((s) => s.clearCart)

  useEffect(() => { loadRazorpayScript() }, [])

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const tax = subtotal * 0.08
  const total = subtotal + tax
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

  const handleCheckout = async () => {
    if (cartItems.length === 0) { setError('Your cart is empty'); return }
    if (!token) { setError('Please log in first to place an order'); return }

    try {
      setLoading(true)
      setError(null)

      const loaded = await loadRazorpayScript()
      if (!loaded) { setError('Failed to load Razorpay. Check your connection.'); setLoading(false); return }

      // Step 1 — create Razorpay order on backend
      const { data: initData } = await axios.post(
        `${API_BASE}/api/v1/payments/create-order`,
        { amount: total },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      const { razorpay_order_id, amount, currency, key_id } = initData.data

      // Step 2 — open Razorpay modal
      await new Promise((resolve, reject) => {
        const options = {
          key: key_id,
          amount,
          currency,
          name: 'NITTE Alumni Shop',
          description: `${itemCount} item${itemCount !== 1 ? 's' : ''}`,
          order_id: razorpay_order_id,
          prefill: {
            name: user?.name || user?.username || '',
            email: user?.email || '',
          },
          theme: { color: '#4f46e5' },
          handler: async (response) => {
            try {
              // Step 3 — verify signature + create DB order
              await axios.post(
                `${API_BASE}/api/v1/payments/verify`,
                {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  items: cartItems.map(item => ({
                    product_id: item._id,
                    quantity: item.quantity,
                    price: item.price,
                  })),
                  shipping_address: 'Demo Address, City, State 12345',
                  notes: 'Paid via Razorpay',
                },
                { headers: { Authorization: `Bearer ${token}` } }
              )
              resolve()
            } catch (err) {
              reject(new Error(err.response?.data?.message || 'Order creation failed after payment'))
            }
          },
          modal: {
            ondismiss: () => reject(new Error('cancelled')),
          },
        }
        const rzp = new window.Razorpay(options)
        rzp.on('payment.failed', (resp) =>
          reject(new Error(resp.error?.description || 'Payment failed'))
        )
        rzp.open()
      })

      setOrderPlaced(true)
      clearCart()
      setTimeout(() => { setCurrentPage('orders'); setOrderPlaced(false) }, 1800)
    } catch (err) {
      if (err.message !== 'cancelled') {
        setError(err.message || 'Payment failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (cartItems.length === 0 && !orderPlaced) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-5">
          <ShoppingBag className="w-7 h-7 text-slate-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Your cart is empty</h2>
        <p className="mt-2 text-sm text-slate-500">
          Looks like you haven't added anything yet. Browse the collection to get started.
        </p>
        <button
          onClick={() => setCurrentPage && setCurrentPage('products')}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition"
        >
          Browse products
        </button>
      </div>
    )
  }

  if (orderPlaced) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-5">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Order placed</h2>
        <p className="mt-2 text-sm text-slate-500">
          Your order is in. We're sending you to your orders page.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Redirecting…
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Checkout</p>
        <h2 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">Your cart</h2>
        <p className="mt-2 text-sm text-slate-500">
          {itemCount} {itemCount === 1 ? 'item' : 'items'} · review and place your order
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2">
          <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-200">
            {cartItems.map((item) => (
              <li key={item._id} className="p-4 sm:p-5 flex gap-4 items-start">
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        if (!e.target.dataset.retried) {
                          e.target.dataset.retried = '1'
                          e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&size=200&background=4f46e5&color=fff&bold=true`
                        }
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-2xl font-bold">
                      {item.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{item.name}</h3>
                      {item.category && (
                        <p className="text-xs text-slate-500 mt-0.5 capitalize">{item.category}</p>
                      )}
                    </div>
                    <button
                      onClick={() => onRemove(item._id)}
                      className="text-slate-400 hover:text-red-600 p-1 -m-1 rounded"
                      title="Remove item"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="mt-1 text-sm text-slate-500">{fmt(item.price)} each</p>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden">
                      <button
                        onClick={() => onUpdateQuantity(item._id, Math.max(1, item.quantity - 1))}
                        disabled={item.quantity <= 1}
                        className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold text-slate-900">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQuantity(item._id, item.quantity + 1)}
                        className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="font-semibold text-slate-900">
                      {fmt(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Summary */}
        <aside className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 p-5 lg:sticky lg:top-20">
            <h3 className="text-base font-semibold text-slate-900">Order summary</h3>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</dt>
                <dd className="font-medium text-slate-900">{fmt(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Tax (8%)</dt>
                <dd className="font-medium text-slate-900">{fmt(tax)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Shipping</dt>
                <dd className="font-medium text-emerald-600">Free</dd>
              </div>
            </dl>

            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-baseline">
              <span className="text-sm font-medium text-slate-900">Total</span>
              <span className="text-xl font-bold text-slate-900">{fmt(total)}</span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={loading || cartItems.length === 0}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Opening Razorpay…
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  Pay {fmt(total)} · Razorpay
                </>
              )}
            </button>

            <p className="mt-3 text-xs text-slate-500 text-center">
              Secured by Razorpay · Free shipping on all orders
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

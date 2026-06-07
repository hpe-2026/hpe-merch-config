import { useState, useEffect, useMemo } from 'react'
import { ShoppingCart, AlertCircle, Loader2, Search, Filter } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config/api'

export default function ProductList({ onAddToCart }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')

  useEffect(() => { fetchProducts() }, [])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${API_BASE}/api/v1/products`)
      setProducts(response.data.data || response.data)
      setError(null)
    } catch (err) {
      setError('Failed to load products. Please ensure the backend is running.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean))
    return ['all', ...Array.from(set)]
  }, [products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      const matchesCat = category === 'all' || p.category === category
      const matchesQ =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      return matchesCat && matchesQ
    })
  }, [products, query, category])

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading the collection…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-5 bg-red-50 border border-red-200 rounded-xl flex gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-red-900 mb-1">Couldn't load products</h3>
          <p className="text-sm text-red-700 mb-3">{error}</p>
          <button
            onClick={fetchProducts}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">
          Collection
        </p>
        <h2 className="mt-1 text-3xl font-bold text-slate-900 tracking-tight">
          Alumni essentials
        </h2>
        <p className="mt-2 text-slate-600 max-w-xl">
          Browse limited-edition merchandise crafted exclusively for the NITTE
          alumni community.
        </p>
      </div>

      {/* Toolbar */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{filtered.length}</span> of {products.length} products
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition ${
                category === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl">
          <p className="text-slate-500">No products match your search.</p>
          {(query || category !== 'all') && (
            <button
              onClick={() => { setQuery(''); setCategory('all') }}
              className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((product) => (
            <ProductCard key={product._id} product={product} onAddToCart={onAddToCart} />
          ))}
        </div>
      )}

    </div>
  )
}

function ProductCard({ product, onAddToCart }) {
  const initial = product.name?.charAt(0).toUpperCase() || '?'
  const inStock = product.stock > 0

  return (
    <div className="group bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-lg overflow-hidden transition-all flex flex-col">
      <div className="relative aspect-square bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={(e) => {
              if (!e.target.dataset.retried) {
                e.target.dataset.retried = 'true'
                e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(product.name)}&size=400&background=4f46e5&color=fff&bold=true`
              } else {
                e.target.style.display = 'none'
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-6xl font-bold text-indigo-300">{initial}</span>
          </div>
        )}
        {!inStock && (
          <div className="absolute top-3 left-3 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider bg-slate-900/90 text-white rounded">
            Sold out
          </div>
        )}
        {product.category && (
          <div className="absolute top-3 right-3 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide bg-white shadow-sm text-slate-700 rounded-md">
            {product.category}
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-slate-900 leading-snug line-clamp-1">
          {product.name}
        </h3>
        <p className="mt-1 text-sm text-slate-500 line-clamp-2 min-h-[2.5rem]">
          {product.description || 'High-quality alumni merchandise'}
        </p>

        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="text-xs text-slate-400">Price</p>
            <p className="text-xl font-bold text-slate-900">
              ₹{Number(product.price || 0).toLocaleString('en-IN')}
            </p>
          </div>
          <p className={`text-xs font-medium ${inStock ? 'text-emerald-600' : 'text-red-600'}`}>
            {inStock ? `${product.stock} left` : 'Unavailable'}
          </p>
        </div>

        <button
          onClick={() => onAddToCart(product)}
          disabled={!inStock}
          className="mt-4 w-full inline-flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition"
        >
          <ShoppingCart className="w-4 h-4" />
          {inStock ? 'Add to cart' : 'Out of stock'}
        </button>
      </div>
    </div>
  )
}

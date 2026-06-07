import { useEffect, useMemo, useState } from 'react'
import { Trash2, Pencil, Plus, AlertCircle, Search, Loader2, Package } from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config/api'

const API_BASE_URL = `${API_BASE}/api/v1`

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [query, setQuery] = useState('')
  const [formData, setFormData] = useState({
    name: '', description: '', price: '', stock: '', category: '',
  })

  useEffect(() => { fetchProducts() }, [])

  const auth = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json',
    },
  })

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const res = await axios.get(`${API_BASE_URL}/products`, auth())
      setProducts(res.data.data || res.data || [])
      setError(null)
    } catch (err) {
      setError('Failed to load products')
    } finally { setLoading(false) }
  }

  const resetForm = () => {
    setFormData({ name: '', description: '', price: '', stock: '', category: '' })
    setEditingId(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingId) {
        await axios.put(`${API_BASE_URL}/products/${editingId}`, formData, auth())
      } else {
        await axios.post(`${API_BASE_URL}/products`, formData, auth())
      }
      resetForm()
      setShowForm(false)
      fetchProducts()
    } catch (err) {
      setError('Failed to save product')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this product permanently?')) return
    try {
      await axios.delete(`${API_BASE_URL}/products/${id}`, auth())
      fetchProducts()
    } catch (err) {
      setError('Failed to delete product')
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
    )
  }, [products, query])

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Catalog</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Products</h1>
          <p className="text-sm text-slate-500 mt-0.5">{products.length} items in catalog</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={() => { setShowForm(!showForm); resetForm() }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
          >
            <Plus className="w-4 h-4" />
            New product
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">
            {editingId ? 'Edit product' : 'Add new product'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Name">
                <input className={inputClass} value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </Field>
              <Field label="Category">
                <input className={inputClass} value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="apparel, accessories…" />
              </Field>
              <Field label="Price (₹)">
                <input type="number" step="0.01" className={inputClass} value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} required />
              </Field>
              <Field label="Stock">
                <input type="number" className={inputClass} value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} required />
              </Field>
            </div>
            <Field label="Description">
              <textarea rows={3} className={inputClass + ' resize-none'} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
                {editingId ? 'Update' : 'Create'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); resetForm() }} className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-200">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Products Grid */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-12 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading products…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500">
            <Package className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm">No products match your filters.</p>
          </div>
        ) : (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((p) => {
              const inStock = (p.stock ?? 0) > 0
              const initial = p.name?.charAt(0).toUpperCase() || '?'
              return (
                <div key={p._id} className="group bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-lg overflow-hidden transition-all flex flex-col">
                  <div className="relative aspect-square bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl font-bold text-indigo-300">{initial}</span>
                      </div>
                    )}
                    {p.category && (
                      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-white/90 backdrop-blur text-slate-700 rounded">
                        {p.category}
                      </div>
                    )}
                    {!inStock && (
                      <div className="absolute top-2.5 right-2.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-slate-900/90 text-white rounded">
                        Sold out
                      </div>
                    )}
                  </div>

                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-semibold text-slate-900 leading-snug line-clamp-1">{p.name}</h3>
                    <p className="mt-1 text-sm text-slate-500 line-clamp-2 min-h-[2.5rem]">
                      {p.description || '—'}
                    </p>

                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <p className="text-xs text-slate-400">Price</p>
                        <p className="text-lg font-bold text-slate-900">₹{Number(p.price || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <p className={`text-xs font-medium ${inStock ? 'text-emerald-600' : 'text-red-500'}`}>
                        {inStock ? `${p.stock} left` : 'Unavailable'}
                      </p>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
                      <button
                        onClick={() => {
                          setEditingId(p._id)
                          setFormData({
                            name: p.name || '', description: p.description || '',
                            price: p.price ?? '', stock: p.stock ?? '',
                            category: p.category || '',
                          })
                          setShowForm(true)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p._id)}
                        className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  )
}

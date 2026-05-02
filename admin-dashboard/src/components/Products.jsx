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

      {/* Table */}
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
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-5 py-3 font-medium">Category</th>
                <th className="text-right px-5 py-3 font-medium">Price</th>
                <th className="text-right px-5 py-3 font-medium">Stock</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p._id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900 line-clamp-1">{p.name}</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{p.description || '—'}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                      {p.category || 'uncategorized'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                    ₹{Number(p.price || 0).toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {(() => {
                      const stock = p.stock ?? 0
                      const tone = stock === 0
                        ? { dot: 'bg-red-500',     text: 'text-red-600',     label: 'Out' }
                        : stock <= 10
                          ? { dot: 'bg-amber-500',  text: 'text-amber-600',  label: 'Low' }
                          : { dot: 'bg-emerald-500',text: 'text-emerald-600',label: 'In stock' }
                      return (
                        <div className="inline-flex items-center gap-2 justify-end">
                          <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                          <span className="font-semibold text-slate-900 tabular-nums">{stock}</span>
                          <span className={`text-[11px] font-medium ${tone.text}`}>{tone.label}</span>
                        </div>
                      )
                    })()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex gap-1">
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
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(p._id)}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

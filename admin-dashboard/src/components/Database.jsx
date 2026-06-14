import { useEffect, useState } from 'react'
import axios from 'axios'
import {
  Database as DbIcon,
  Table2,
  Server,
  Trash2,
  Pencil,
  X,
  Check,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  HardDrive,
} from 'lucide-react'
import { API_BASE } from '../config/api'

const auth = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
})

export default function DatabasePanel() {
  const [collections, setCollections] = useState([])
  const [sharding, setSharding] = useState(null)
  const [selectedCol, setSelectedCol] = useState(null)
  const [docs, setDocs] = useState([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingDoc, setEditingDoc] = useState(null)
  const [editJson, setEditJson] = useState('')

  useEffect(() => {
    fetchCollections()
    fetchSharding()
  }, [])

  useEffect(() => {
    if (selectedCol) fetchDocs(selectedCol, 0)
  }, [selectedCol])

  const fetchCollections = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/admin/database/collections`, auth())
      setCollections(res.data.data || [])
    } catch (err) {
      setError('Failed to load collections')
    } finally {
      setLoading(false)
    }
  }

  const fetchSharding = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/admin/database/sharding`, auth())
      setSharding(res.data.data)
    } catch (err) { /* non-critical */ }
  }

  const fetchDocs = async (name, newSkip) => {
    try {
      const res = await axios.get(
        `${API_BASE}/api/v1/admin/database/collections/${name}?skip=${newSkip}&limit=15`,
        auth()
      )
      setDocs(res.data.data || [])
      setTotal(res.data.total || 0)
      setSkip(newSkip)
    } catch (err) {
      setError(`Failed to load documents from ${name}`)
    }
  }

  const handleDelete = async (colName, docId) => {
    if (!confirm('Delete this document permanently?')) return
    try {
      await axios.delete(`${API_BASE}/api/v1/admin/database/collections/${colName}/${docId}`, auth())
      fetchDocs(colName, skip)
      fetchCollections()
    } catch (err) {
      setError('Failed to delete document')
    }
  }

  const handleEdit = (doc) => {
    const clean = { ...doc }
    delete clean._id
    setEditingDoc(doc._id)
    setEditJson(JSON.stringify(clean, null, 2))
  }

  const handleSave = async (colName, docId) => {
    try {
      const parsed = JSON.parse(editJson)
      await axios.put(`${API_BASE}/api/v1/admin/database/collections/${colName}/${docId}`, parsed, auth())
      setEditingDoc(null)
      fetchDocs(colName, skip)
    } catch (err) {
      setError(err.message?.includes('JSON') ? 'Invalid JSON' : 'Failed to save')
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Infrastructure</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Database</h1>
        <p className="text-sm text-slate-500 mt-0.5">MongoDB sharded cluster — browse collections and view shard distribution</p>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4 text-red-400" /></button>
        </div>
      )}

      {/* Sharding Visualization */}
      {sharding && (
        <div className="mb-6 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-600" />
            Shard Cluster
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {sharding.shards.map((shard) => (
              <div key={shard.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{shard.id}</p>
                    <p className="text-xs text-slate-500 font-mono">{shard.host}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {shard.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-indigo-600 text-white rounded-md font-medium">
                      {tag}
                    </span>
                  ))}
                  <span className="text-slate-500">{shard.chunks} chunk{shard.chunks !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Zone Mapping */}
          {sharding.zones.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <h3 className="text-xs font-semibold text-slate-700 uppercase mb-2">Zone Routing (orders)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {sharding.zones.map((z, i) => (
                  <div key={i} className="text-center p-2 bg-white border border-slate-200 rounded-lg">
                    <p className="text-sm font-semibold text-slate-900">{Object.values(z.min)[0]}</p>
                    <p className="text-[10px] text-slate-500">→ {z.zone}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Orders by region */}
          {sharding.ordersByRegion.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <h3 className="text-xs font-semibold text-slate-700 uppercase mb-2">Orders by Region</h3>
              <div className="flex gap-3">
                {sharding.ordersByRegion.map(r => (
                  <div key={r._id} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-center">
                    <p className="text-lg font-bold text-slate-900">{r.count}</p>
                    <p className="text-xs text-slate-500 capitalize">{r._id || 'unknown'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Collections sidebar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 lg:sticky lg:top-20 self-start">
          <h2 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <DbIcon className="w-4 h-4 text-slate-500" />
            Collections
          </h2>
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600 mx-auto" />
          ) : (
            <ul className="space-y-1">
              {collections.map(col => (
                <li key={col.name}>
                  <button
                    onClick={() => setSelectedCol(col.name)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                      selectedCol === col.name
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="truncate">{col.name}</span>
                      <span className="text-xs text-slate-400 ml-2">{col.count}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Documents area */}
        <div className="lg:col-span-3">
          {!selectedCol ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Table2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Select a collection to browse documents</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{selectedCol}</h2>
                  <p className="text-xs text-slate-500">{total} document{total !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <button
                    onClick={() => fetchDocs(selectedCol, Math.max(0, skip - 15))}
                    disabled={skip === 0}
                    className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span>{skip + 1}–{Math.min(skip + 15, total)} of {total}</span>
                  <button
                    onClick={() => fetchDocs(selectedCol, skip + 15)}
                    disabled={skip + 15 >= total}
                    className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {docs.map((doc) => {
                  const docId = doc._id?.$oid || doc._id?.toString() || doc._id
                  const isEditing = editingDoc === doc._id

                  return (
                    <div key={docId} className="px-5 py-3">
                      {isEditing ? (
                        <div>
                          <textarea
                            value={editJson}
                            onChange={(e) => setEditJson(e.target.value)}
                            className="w-full h-48 font-mono text-xs p-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleSave(selectedCol, docId)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                            >
                              <Check className="w-3 h-3" /> Save
                            </button>
                            <button
                              onClick={() => setEditingDoc(null)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                            >
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <pre className="flex-1 text-xs text-slate-700 font-mono overflow-x-auto whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-100">
                            {JSON.stringify(doc, null, 2)}
                          </pre>
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleEdit(doc)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(selectedCol, docId)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {docs.length === 0 && (
                  <div className="px-5 py-8 text-center text-sm text-slate-500">
                    No documents in this collection
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

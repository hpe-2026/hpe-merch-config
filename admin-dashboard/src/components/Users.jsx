import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Search,
  ShieldCheck,
  XCircle,
  FileText,
  Loader2,
  Users as UsersIcon,
  RefreshCw,
} from 'lucide-react'
import axios from 'axios'
import { API_BASE } from '../config/api'

const TABS = [
  { id: 'pending', label: 'Pending review' },
  { id: 'approved', label: 'Approved' },
]

export default function Users() {
  const [tab, setTab] = useState('pending')
  const [pending, setPending] = useState([])
  const [approved, setApproved] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [details, setDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [flash, setFlash] = useState(null)

  const auth = () => ({
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json',
    },
  })

  const fetchAll = async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Not authenticated. Please log in again.')
      const [p, a] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/admin/users/unverified`, auth()),
        axios.get(`${API_BASE}/api/v1/admin/users/verified`, auth()),
      ])
      setPending(p.data.data?.users || [])
      setApproved(a.data.data?.users || [])
      setError(null)
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 15000)
    return () => clearInterval(t)
  }, [])

  const showFlash = (type, text) => {
    setFlash({ type, text })
    setTimeout(() => setFlash(null), 3000)
  }

  const openDetails = async (userId) => {
    try {
      setDetailsLoading(true)
      setDetailsError(null)
      const res = await axios.get(`${API_BASE}/api/v1/admin/users/${userId}/verification`, auth())
      setDetails(res.data.data)
    } catch (err) {
      setDetailsError(err.response?.data?.message || 'Failed to load verification details')
    } finally {
      setDetailsLoading(false)
    }
  }

  const approveUser = async (userId, name) => {
    const reason = window.prompt(`Approve ${name}?`, 'Verified by admin')
    if (reason === null) return
    try {
      await axios.post(
        `${API_BASE}/api/v1/admin/users/${userId}/approve`,
        { approval_reason: reason || 'Verified by admin' },
        auth()
      )
      showFlash('success', `${name} approved.`)
      setDetails(null)
      fetchAll()
    } catch (err) {
      showFlash('error', err.response?.data?.message || 'Failed to approve user')
    }
  }

  const rejectUser = async (userId, name) => {
    const reason = window.prompt(`Reject ${name}? Enter a reason:`, 'Verification details were insufficient')
    if (reason === null) return
    try {
      await axios.post(
        `${API_BASE}/api/v1/admin/users/${userId}/reject`,
        { rejection_reason: reason || 'Verification details were insufficient' },
        auth()
      )
      showFlash('success', `${name} rejected.`)
      setDetails(null)
      fetchAll()
    } catch (err) {
      showFlash('error', err.response?.data?.message || 'Failed to reject user')
    }
  }

  const dataset = tab === 'pending' ? pending : approved

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim()
    if (!q) return dataset
    return dataset.filter((u) => {
      const haystack = [u.name, u.email, u.alumni_id, u.user_id, u.department].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [dataset, searchTerm])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Identity</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">User verification</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Review pending registrations and manage approved alumni accounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, email, alumni ID"
              className="pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72"
            />
          </div>
          <button
            onClick={fetchAll}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Flash + errors */}
      {flash && (
        <div className={`mb-4 flex items-start gap-2 p-3 rounded-lg border ${
          flash.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {flash.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertCircle className="w-4 h-4 mt-0.5" />}
          <p className="text-sm">{flash.text}</p>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {detailsError && (
        <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-700">{detailsError}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5">
        {TABS.map((t) => {
          const active = tab === t.id
          const count = t.id === 'pending' ? pending.length : approved.length
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setDetails(null) }}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Table */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="py-12 flex items-center justify-center text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500">
              {tab === 'pending' ? (
                <>
                  <ShieldCheck className="w-10 h-10 text-emerald-300 mb-3" />
                  <p className="text-sm font-medium text-slate-700">No pending verifications</p>
                  <p className="text-xs text-slate-500">You're all caught up.</p>
                </>
              ) : (
                <>
                  <UsersIcon className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-sm font-medium text-slate-700">No approved users yet</p>
                </>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">User</th>
                  <th className="text-left px-5 py-3 font-medium">Department</th>
                  <th className="text-left px-5 py-3 font-medium">Alumni ID</th>
                  <th className="text-left px-5 py-3 font-medium">{tab === 'pending' ? 'Submitted' : 'Approved'}</th>
                  <th className="text-right px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.user_id || u._id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="relative w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-bold">
                          {(u.name || '?').charAt(0).toUpperCase()}
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                              tab === 'approved' ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            title={tab === 'approved' ? 'Verified' : 'Pending'}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{u.name}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-slate-700">{u.department || '—'}</p>
                      <p className="text-xs text-slate-500">{u.graduation_year ? `Class of ${u.graduation_year}` : ''}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs text-slate-600">{u.alumni_id || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {tab === 'pending'
                        ? (u.registration_timestamp ? new Date(u.registration_timestamp).toLocaleString() : '—')
                        : (u.approval_timestamp ? new Date(u.approval_timestamp).toLocaleString() : '—')}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {tab === 'pending' ? (
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => openDetails(u._id)}
                            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"
                            title="View details"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => approveUser(u._id, u.name)}
                            className="p-1.5 text-emerald-600 hover:text-white hover:bg-emerald-600 rounded transition"
                            title="Approve"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => rejectUser(u._id, u.name)}
                            className="p-1.5 text-red-600 hover:text-white hover:bg-red-600 rounded transition"
                            title="Reject"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Verified
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 self-start">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Verification details</h2>
          {detailsLoading ? (
            <div className="py-8 flex items-center justify-center text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : details ? (
            <div className="space-y-3 text-sm">
              <DetailRow label="Name" value={details.name} />
              <DetailRow label="Email" value={details.email} />
              <DetailRow label="Alumni ID" value={details.alumni_id} mono />
              <DetailRow label="Department" value={details.department} />
              <DetailRow label="Graduation year" value={details.graduation_year} />
              <DetailRow label="Status" value={details.status || 'pending'} />
              <DetailRow
                label="Submitted"
                value={details.registration_timestamp ? new Date(details.registration_timestamp).toLocaleString() : '—'}
              />
              {tab === 'pending' && (
                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => approveUser(details._id, details.name)}
                    className="flex-1 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => rejectUser(details._id, details.name)}
                    className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <UsersIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                {tab === 'pending'
                  ? 'Select a user to view their verification record.'
                  : 'Select a user to view their record.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400 text-center">
        Showing {filtered.length} {tab === 'pending' ? 'pending' : 'approved'} user{filtered.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

function DetailRow({ label, value, mono }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 font-medium text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>
        {value || '—'}
      </p>
    </div>
  )
}

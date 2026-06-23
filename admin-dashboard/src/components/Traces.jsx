import { useEffect, useState, useCallback } from 'react'
import {
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Activity,
  Zap,
  Clock,
  TrendingUp,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { API_BASE } from '../config/api'

const JAEGER_PROXY_API = `${API_BASE}/api/v1/jaeger`

// Derive the externally-reachable Jaeger UI URL from the current host.
// admin.<env>.nitte.local  ->  jaeger.<env>.nitte.local (same port/tunnel).
// Falls back to localhost for local dev.
const JAEGER_UI = (() => {
  if (typeof window === 'undefined') return 'http://localhost:16686'
  const { protocol, hostname, port } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:16686'
  const base = hostname.split('.').slice(1).join('.') || hostname
  return `${protocol}//jaeger.${base}${port ? ':' + port : ''}`
})()

export default function Traces() {
  const [jaegerStatus, setJaegerStatus] = useState('checking')
  const [services, setServices] = useState([])
  const [selectedService, setSelectedService] = useState(null)
  const [traces, setTraces] = useState([])
  const [stats, setStats] = useState({ totalTraces: 0, avgDuration: 0, errorRate: 0 })
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [totalPages, setTotalPages] = useState(1)

  const checkJaegerHealth = useCallback(async () => {
    try {
      const res = await fetch(`${JAEGER_PROXY_API}/health`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setJaegerStatus(data.status === 'online' ? 'online' : 'offline')
      } else {
        setJaegerStatus('offline')
      }
    } catch {
      setJaegerStatus('offline')
    }
  }, [])

  const fetchServices = useCallback(async () => {
    try {
      const res = await fetch(`${JAEGER_PROXY_API}/services`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        const sorted = (data.data || []).slice().sort()
        setServices(sorted)
        if (!selectedService && sorted.length) setSelectedService(sorted[0])
      }
    } catch {
      // ignore — surfaced via status banner
    }
  }, [selectedService])

  const calcDuration = (spans) => {
    if (!spans?.length) return null
    let minStart = Infinity
    let maxEnd = 0
    spans.forEach((s) => {
      const start = s.startTime || 0
      const dur = s.duration || 0
      minStart = Math.min(minStart, start)
      maxEnd = Math.max(maxEnd, start + dur)
    })
    return maxEnd > minStart ? maxEnd - minStart : null
  }

  const calcStartTime = (spans) => {
    if (!spans?.length) return null
    return Math.min(...spans.map((s) => s.startTime || 0)) || null
  }

  const fetchTraces = useCallback(async (service, page = 1, perPage = itemsPerPage) => {
    if (!service) return
    setLoading(true)
    try {
      const offset = (page - 1) * perPage
      const res = await fetch(
        `${JAEGER_PROXY_API}/traces?service=${service}&limit=${perPage}&offset=${offset}`,
        { credentials: 'include' }
      )
      if (res.ok) {
        const data = await res.json()
        const list = data.data || []
        setTraces(list)
        const total = data.total || list.length
        setTotalPages(Math.max(1, Math.ceil(total / perPage)))

        if (list.length) {
          const durations = list.map((t) => calcDuration(t.spans)).filter(Boolean)
          const avg = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length / 1000) : 0
          const errors = list.filter((t) =>
            t.spans?.some((s) =>
              s.tags?.some((tag) =>
                (tag.key === 'error' && tag.value === true) ||
                (tag.key === 'http.response.status_code' && tag.value >= 400) ||
                (tag.key === 'http.status_code' && tag.value >= 400)
              )
            )
          ).length
          setStats({
            totalTraces: total,
            avgDuration: avg,
            errorRate: list.length ? Math.round((errors / list.length) * 100) : 0,
          })
        } else {
          setStats({ totalTraces: 0, avgDuration: 0, errorRate: 0 })
        }
      }
    } catch (err) {
      console.error('Failed to fetch traces:', err)
    } finally {
      setLoading(false)
    }
  }, [itemsPerPage])

  useEffect(() => {
    checkJaegerHealth()
    fetchServices()
    const id = setInterval(checkJaegerHealth, 15000)
    return () => clearInterval(id)
  }, [checkJaegerHealth, fetchServices])

  useEffect(() => {
    if (selectedService) {
      setCurrentPage(1)
      fetchTraces(selectedService, 1)
    }
  }, [selectedService, fetchTraces])

  const handleRefresh = () => {
    checkJaegerHealth()
    fetchServices()
    if (selectedService) {
      setCurrentPage(1)
      fetchTraces(selectedService, 1)
    }
  }

  const fmtDuration = (us) => {
    if (!us) return '0ms'
    const ms = Math.round(us / 1000)
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`
  }

  const fmtTime = (ts) => {
    if (!ts) return '—'
    return new Date(Math.floor(ts / 1000)).toLocaleTimeString('en-US', { hour12: false })
  }

  const getTraceName = (spans) => {
    if (!spans?.length) return 'Unknown'
    const root = spans.find((s) => !s.references?.length)
    return root?.operationName || spans[0]?.operationName || 'Unknown'
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Observability</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Distributed traces</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Inspect end-to-end request spans collected by Jaeger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={JAEGER_UI}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
          >
            Jaeger UI
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Status banner */}
      <div
        className={`mb-6 flex items-start gap-2 p-3 rounded-lg border ${
          jaegerStatus === 'online'
            ? 'bg-emerald-50 border-emerald-200'
            : jaegerStatus === 'offline'
            ? 'bg-red-50 border-red-200'
            : 'bg-slate-50 border-slate-200'
        }`}
      >
        {jaegerStatus === 'online' && <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />}
        {jaegerStatus === 'offline' && <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />}
        {jaegerStatus === 'checking' && <Activity className="w-4 h-4 text-slate-500 mt-0.5" />}
        <div className="flex-1">
          <p
            className={`text-sm font-medium ${
              jaegerStatus === 'online'
                ? 'text-emerald-700'
                : jaegerStatus === 'offline'
                ? 'text-red-700'
                : 'text-slate-700'
            }`}
          >
            {jaegerStatus === 'online' && 'Jaeger is online — receiving traces.'}
            {jaegerStatus === 'offline' && 'Jaeger is unreachable.'}
            {jaegerStatus === 'checking' && 'Checking Jaeger status…'}
          </p>
          {jaegerStatus === 'offline' && (
            <p className="text-xs text-red-600 mt-0.5">
              Start the stack with{' '}
              <code className="bg-red-100 px-1.5 py-0.5 rounded font-mono text-[11px]">./docker-setup.sh start</code>
            </p>
          )}
        </div>
      </div>

      {jaegerStatus === 'online' && (
        <>
          {/* Service picker */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <h2 className="text-sm font-semibold text-slate-900 mb-1">Service</h2>
            <p className="text-xs text-slate-500 mb-4">
              Pick a service to load its most recent traces.
            </p>
            {services.length === 0 ? (
              <p className="text-sm text-slate-500">
                No services reporting yet — generate some traffic and refresh.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {services.map((s) => {
                  const active = selectedService === s
                  return (
                    <button
                      key={s}
                      onClick={() => setSelectedService(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* KPI strip */}
          {selectedService && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Kpi
                icon={TrendingUp}
                label="Total traces"
                value={stats.totalTraces.toLocaleString()}
                tone="indigo"
              />
              <Kpi
                icon={Clock}
                label="Avg duration"
                value={stats.avgDuration}
                unit="ms"
                tone="emerald"
              />
              <Kpi
                icon={Zap}
                label="Error rate"
                value={stats.errorRate}
                unit="%"
                tone={stats.errorRate > 0 ? 'red' : 'emerald'}
              />
            </div>
          )}

          {/* Recent traces */}
          {selectedService && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Recent traces</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedService} · click any row to open in Jaeger
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <label className="text-slate-500">Per page</label>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      const n = parseInt(e.target.value)
                      setItemsPerPage(n)
                      setCurrentPage(1)
                      fetchTraces(selectedService, 1, n)
                    }}
                    className="px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {[10, 20, 50, 100].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="py-12 flex items-center justify-center text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading traces…
                </div>
              ) : traces.length === 0 ? (
                <div className="py-12 px-5 text-center text-sm text-slate-500">
                  <p className="font-medium text-slate-700 mb-1">No traces yet</p>
                  <p>Generate some traffic and refresh:</p>
                  <code className="inline-block mt-2 bg-slate-100 px-2 py-1 rounded font-mono text-xs text-slate-700">
                    {`curl ${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/health`}
                  </code>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium">Trace ID</th>
                      <th className="text-left px-5 py-3 font-medium">Operation</th>
                      <th className="text-right px-5 py-3 font-medium">Spans</th>
                      <th className="text-right px-5 py-3 font-medium">Duration</th>
                      <th className="text-right px-5 py-3 font-medium">Time</th>
                      <th className="text-center px-5 py-3 font-medium">Status</th>
                      <th className="text-right px-5 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traces.map((t) => {
                      const hasError = t.spans?.some((s) =>
                        s.tags?.some((tag) =>
                          (tag.key === 'error' && tag.value === true) ||
                          (tag.key === 'http.response.status_code' && tag.value >= 400) ||
                          (tag.key === 'http.status_code' && tag.value >= 400)
                        )
                      )
                      const dur = calcDuration(t.spans)
                      const start = calcStartTime(t.spans)

                      return (
                        <tr
                          key={t.traceID}
                          className="border-t border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => window.open(`${JAEGER_UI}/trace/${t.traceID}`, '_blank')}
                        >
                          <td className="px-5 py-3 font-mono text-xs text-indigo-600">
                            {t.traceID?.slice(0, 16)}…
                          </td>
                          <td className="px-5 py-3 text-slate-700">
                            {getTraceName(t.spans)}
                          </td>
                          <td className="px-5 py-3 text-right text-slate-700">
                            {t.spans?.length || 0}
                          </td>
                          <td className="px-5 py-3 text-right text-slate-700 font-mono text-xs">
                            {fmtDuration(dur)}
                          </td>
                          <td className="px-5 py-3 text-right text-xs text-slate-500 font-mono">
                            {fmtTime(start)}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                hasError ? 'text-red-700' : 'text-emerald-700'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${hasError ? 'bg-red-500' : 'bg-emerald-500'}`} />
                              {hasError ? 'Error' : 'OK'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <a
                              href={`${JAEGER_UI}/trace/${t.traceID}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                            >
                              View
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}

              {/* Pagination */}
              {!loading && traces.length > 0 && (
                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <p>
                    Showing{' '}
                    <span className="font-semibold text-slate-700">
                      {(currentPage - 1) * itemsPerPage + 1}
                    </span>
                    –
                    <span className="font-semibold text-slate-700">
                      {Math.min(currentPage * itemsPerPage, stats.totalTraces)}
                    </span>{' '}
                    of <span className="font-semibold text-slate-700">{stats.totalTraces}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const p = currentPage - 1
                        setCurrentPage(p)
                        fetchTraces(selectedService, p)
                      }}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Previous
                    </button>
                    <span className="text-slate-500">
                      Page <span className="font-semibold text-slate-700">{currentPage}</span> /{' '}
                      {Math.max(1, totalPages)}
                    </span>
                    <button
                      onClick={() => {
                        const p = currentPage + 1
                        setCurrentPage(p)
                        fetchTraces(selectedService, p)
                      }}
                      disabled={currentPage >= totalPages}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, unit, tone }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone] || tones.indigo}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <p className="mt-4 text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>}
      </p>
    </div>
  )
}

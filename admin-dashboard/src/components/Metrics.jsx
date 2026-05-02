import { useEffect, useState } from 'react'
import {
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Activity,
  Zap,
  Clock,
  AlertTriangle,
  Server,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import axios from 'axios'
import { API_BASE } from '../config/api'
import { useTheme } from '../hooks/useTheme'

const chartPalette = (isDark) =>
  isDark
    ? {
        grid: '#334155',          // slate-700
        axis: '#94a3b8',          // slate-400
        tooltipBg: '#0f172a',     // slate-900
        tooltipBorder: '#334155', // slate-700
        tooltipText: '#e2e8f0',   // slate-200
        lines: {
          requests: '#818cf8',    // indigo-400
          latency:  '#fbbf24',    // amber-400
          errors:   '#f87171',    // red-400
          conns:    '#a78bfa',    // violet-400
          orders:   '#34d399',    // emerald-400
          products: '#818cf8',    // indigo-400
        },
      }
    : {
        grid: '#e2e8f0',          // slate-200
        axis: '#94a3b8',          // slate-400
        tooltipBg: '#ffffff',
        tooltipBorder: '#e2e8f0',
        tooltipText: '#0f172a',
        lines: {
          requests: '#6366f1',    // indigo-500
          latency:  '#f59e0b',    // amber-500
          errors:   '#ef4444',    // red-500
          conns:    '#8b5cf6',    // violet-500
          orders:   '#10b981',    // emerald-500
          products: '#6366f1',    // indigo-500
        },
      }

const PROM_URL = 'http://localhost:9090'

export default function Metrics() {
  const { isDark } = useTheme()
  const c = chartPalette(isDark)
  const tooltipStyle = {
    borderRadius: 8,
    border: `1px solid ${c.tooltipBorder}`,
    backgroundColor: c.tooltipBg,
    color: c.tooltipText,
    fontSize: 12,
  }
  const tooltipItemStyle = { color: c.tooltipText }
  const tooltipLabelStyle = { color: c.tooltipText }

  const [metrics, setMetrics] = useState({
    requestsPerSec: 0,
    p95Latency: 0,
    errorRate: 0,
    activeConnections: 0,
    productsViewed: 0,
    ordersRate: 0,
  })
  const [history, setHistory] = useState([])
  const [services, setServices] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 10000)
    return () => clearInterval(t)
  }, [])

  const fetchAll = async () => {
    await Promise.all([fetchMetrics(), fetchServiceHealth()])
    setLoading(false)
  }

  const fetchMetrics = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/metrics/dashboard`)
      const d = res.data.data || {}
      const m = {
        requestsPerSec: parseFloat(d.requests_per_sec) || 0,
        p95Latency: parseFloat(d.p95_latency) || 0,
        errorRate: parseFloat(d.error_rate) || 0,
        activeConnections: parseFloat(d.active_connections) || 0,
        productsViewed: parseFloat(d.products_viewed) || 0,
        ordersRate: parseFloat(d.orders_rate) || 0,
      }
      setMetrics(m)
      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            requests: m.requestsPerSec,
            latency: m.p95Latency,
            errors: m.errorRate,
            connections: m.activeConnections,
            orders: m.ordersRate,
            products: m.productsViewed,
          },
        ]
        return next.slice(-30)
      })
      setError(null)
    } catch (err) {
      setError('Unable to reach the metrics gateway. Make sure Prometheus and the API gateway are running.')
    }
  }

  // Real service health from Prometheus `up` query
  const fetchServiceHealth = async () => {
    try {
      const res = await axios.get(`${PROM_URL}/api/v1/query`, {
        params: { query: 'up' },
        timeout: 3000,
      })
      const rows = res.data?.data?.result || []
      const list = rows.map((r) => ({
        job: r.metric.job || 'unknown',
        instance: r.metric.instance,
        up: r.value?.[1] === '1',
      }))
      // Sort: down first
      list.sort((a, b) => (a.up === b.up ? 0 : a.up ? 1 : -1))
      setServices(list)
    } catch {
      setServices([])
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <p className="text-xs font-semibold text-indigo-600 tracking-wider uppercase">Observability</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">Metrics</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Live performance and service health pulled from Prometheus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={PROM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
          >
            Prometheus
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
          >
            Grafana
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
          <p className="text-sm text-amber-700">{error}</p>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Kpi
          icon={Activity}
          label="Requests / sec"
          value={metrics.requestsPerSec.toFixed(2)}
          unit="req/s"
          tone="indigo"
        />
        <Kpi
          icon={Clock}
          label="Response time p95"
          value={metrics.p95Latency.toFixed(2)}
          unit="ms"
          tone={metrics.p95Latency > 500 ? 'amber' : 'emerald'}
        />
        <Kpi
          icon={AlertTriangle}
          label="Error rate"
          value={metrics.errorRate.toFixed(2)}
          unit="%"
          tone={metrics.errorRate > 1 ? 'red' : 'emerald'}
        />
        <Kpi
          icon={Zap}
          label="Active connections"
          value={Math.round(metrics.activeConnections)}
          unit="conns"
          tone="indigo"
        />
      </div>

      {/* Service health */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Service health</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pulled from Prometheus <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">up</code> query.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {services.filter((s) => s.up).length}/{services.length} up
          </span>
        </div>
        {services.length === 0 ? (
          <p className="text-sm text-slate-500">No targets reporting yet.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {services.map((s) => (
              <div
                key={s.instance}
                className={`px-3 py-3 rounded-lg border ${
                  s.up ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.up ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <p className="text-sm font-semibold text-slate-900">{s.job}</p>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 font-mono truncate">{s.instance}</p>
                <p className={`mt-1 text-xs font-medium ${s.up ? 'text-emerald-700' : 'text-red-700'}`}>
                  {s.up ? 'Up' : 'Down'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ChartCard title="Requests & latency" subtitle="Request volume vs p95 latency over time">
          {history.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="time" stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="r" orientation="right" stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ stroke: c.grid }} />
                <Legend wrapperStyle={{ fontSize: 12, color: c.axis }} />
                <Line yAxisId="l" type="monotone" dataKey="requests" stroke={c.lines.requests} strokeWidth={2} dot={false} name="req/s" />
                <Line yAxisId="r" type="monotone" dataKey="latency" stroke={c.lines.latency} strokeWidth={2} dot={false} name="p95 ms" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Errors & connections" subtitle="Error rate vs active connections">
          {history.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="time" stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="l" stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="r" orientation="right" stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ stroke: c.grid }} />
                <Legend wrapperStyle={{ fontSize: 12, color: c.axis }} />
                <Line yAxisId="l" type="monotone" dataKey="errors" stroke={c.lines.errors} strokeWidth={2} dot={false} name="error %" />
                <Line yAxisId="r" type="monotone" dataKey="connections" stroke={c.lines.conns} strokeWidth={2} dot={false} name="connections" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Business activity" subtitle="Orders and products viewed per second" wide>
          {history.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gOrd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c.lines.orders} stopOpacity={isDark ? 0.45 : 0.3} />
                    <stop offset="95%" stopColor={c.lines.orders} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gPrd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c.lines.products} stopOpacity={isDark ? 0.45 : 0.3} />
                    <stop offset="95%" stopColor={c.lines.products} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
                <XAxis dataKey="time" stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} cursor={{ stroke: c.grid }} />
                <Legend wrapperStyle={{ fontSize: 12, color: c.axis }} />
                <Area type="monotone" dataKey="products" stroke={c.lines.products} fill="url(#gPrd)" name="products viewed" />
                <Area type="monotone" dataKey="orders" stroke={c.lines.orders} fill="url(#gOrd)" name="orders" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* External links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ToolCard
          title="Prometheus"
          description="Query and explore metrics directly with PromQL."
          href={PROM_URL}
        />
        <ToolCard
          title="Jaeger"
          description="Distributed traces and service dependency graphs."
          href="http://localhost:16686"
        />
        <ToolCard
          title="Grafana"
          description="Pre-built dashboards and alerting (admin / admin123)."
          href="http://localhost:3001"
        />
      </div>
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
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone] || tones.indigo}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 tracking-tight">
        {value}
        <span className="ml-1 text-sm font-medium text-slate-400">{unit}</span>
      </p>
    </div>
  )
}

function ChartCard({ title, subtitle, children, wide }) {
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 ${wide ? 'lg:col-span-2' : ''}`}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Empty() {
  return (
    <div className="h-60 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
      Collecting data…
    </div>
  )
}

function ToolCard({ title, description, href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group bg-white rounded-xl border border-slate-200 hover:border-indigo-200 hover:shadow-md p-5 transition flex flex-col"
    >
      <div className="flex items-center justify-between mb-3">
        <Server className="w-4 h-4 text-slate-400" />
        <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
      </div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </a>
  )
}

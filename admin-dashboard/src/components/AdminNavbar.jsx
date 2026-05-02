import {
  LayoutDashboard,
  Activity,
  Zap,
  Users,
  Package,
  ShoppingCart,
  LogOut,
  ShieldCheck,
  Store,
} from 'lucide-react'
import ThemeToggle from './ThemeToggle'

const MERCHANT_ROLES = ['merchant', 'merchant-amazon', 'merchant-flipkart']

function isMerchant(user) {
  return (
    user?.role === 'merchant' ||
    user?.isMerchant ||
    user?.roles?.some(r => MERCHANT_ROLES.includes(r))
  )
}

function isAdmin(user) {
  return (
    user?.role === 'admin' ||
    user?.roles?.includes('admin') ||
    user?.roles?.includes('admin-internal')
  )
}

export default function AdminNavbar({ currentPage, setCurrentPage, user, onLogout }) {
  const merchantOnly = isMerchant(user) && !isAdmin(user)

  const adminNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'metrics', label: 'Metrics', icon: Activity },
    { id: 'traces', label: 'Traces', icon: Zap },
  ]

  const merchantNavItems = [
    { id: 'merchant-dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'products', label: 'My Products', icon: Package },
    { id: 'orders', label: 'My Orders', icon: ShoppingCart },
  ]

  const navItems = merchantOnly ? merchantNavItems : adminNavItems
  const homeId = merchantOnly ? 'merchant-dashboard' : 'dashboard'

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top row: brand + user */}
        <div className="h-16 flex items-center justify-between">
          <button
            onClick={() => setCurrentPage(homeId)}
            className="flex items-center gap-2.5 group"
          >
            {merchantOnly ? (
              <Store className="w-7 h-7 text-indigo-600 group-hover:text-indigo-700 transition" strokeWidth={2.25} />
            ) : (
              <ShieldCheck className="w-7 h-7 text-white group-hover:text-white/90 transition" strokeWidth={2.25} />
            )}
            <div className="text-left hidden sm:block leading-tight">
              <p className="text-sm font-extrabold tracking-tight text-slate-900">
                {merchantOnly ? 'NITTE Merchant' : 'NITTE Admin'}
              </p>
              <p className="text-[11px] font-medium text-slate-500">
                {merchantOnly ? 'Merchant Portal' : 'Operations Console'}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {user && (
              <button
                onClick={() => setCurrentPage('profile')}
                title="View profile"
                className={`hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition ${
                  currentPage === 'profile'
                    ? 'bg-indigo-50 border-indigo-200'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                  {(user.name || user.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-900 leading-tight">
                    {user.name || 'Administrator'}
                  </p>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    {user.email}
                  </p>
                </div>
              </button>
            )}

            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>

        {/* Bottom row: tabs */}
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-2 -mt-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = currentPage === item.id
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

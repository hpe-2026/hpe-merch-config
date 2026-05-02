import { ShoppingCart, Home, Package, User, LogOut, CircleDot, GraduationCap } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

export default function Navbar({ cartCount, currentPage, setCurrentPage, apiStatus, user, onLogout }) {
  const navItem = (key, label, Icon) => {
    const active = currentPage === key
    return (
      <button
        onClick={() => setCurrentPage(key)}
        className={`relative inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
          active
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
      >
        <Icon className="w-4 h-4" />
        <span className="hidden sm:inline">{label}</span>
        {key === 'cart' && cartCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
            {cartCount}
          </span>
        )}
      </button>
    )
  }

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-4">
          {/* Brand */}
          <button
            onClick={() => setCurrentPage('products')}
            className="flex items-center gap-2.5 group"
          >
            <GraduationCap
              className="w-7 h-7 text-white group-hover:text-white/90 transition"
              strokeWidth={2.25}
            />
            <div className="text-left hidden sm:block leading-tight">
              <p className="text-sm font-extrabold tracking-tight text-slate-900">NITTE Alumni</p>
              <p className="text-[11px] font-medium text-indigo-600">Official Merch Store</p>
            </div>
          </button>

          {/* Center nav */}
          <div className="flex items-center gap-1">
            {navItem('products', 'Shop', Home)}
            {navItem('cart', 'Cart', ShoppingCart)}
            {navItem('orders', 'Orders', Package)}
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-3">
            <div
              className={`hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full ${
                apiStatus === 'online'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
              }`}
              title={`API ${apiStatus}`}
            >
              <CircleDot className="w-3 h-3" />
              {apiStatus === 'online' ? 'Online' : 'Offline'}
            </div>

            <ThemeToggle />

            {user && (
              <>
                <button
                  onClick={() => setCurrentPage('profile')}
                  className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition ${
                    currentPage === 'profile'
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Profile"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold">
                    {(user.name || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden lg:inline font-medium">
                    {user.name?.split(' ')[0] || user.email}
                  </span>
                </button>

                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}

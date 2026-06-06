import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export default function ThemeToggle({ className = '' }) {
  const { isDark, toggle } = useTheme()
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle dark mode"
      className={
        'relative inline-flex items-center justify-center w-9 h-9 rounded-lg ' +
        'text-slate-600 hover:text-slate-900 hover:bg-slate-100 ' +
        'dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 ' +
        'border border-slate-200 dark:border-slate-700 transition ' +
        className
      }
    >
      {isDark ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  )
}

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  safelist: [
    // Light mode badge backgrounds
    'bg-amber-100', 'text-amber-800', 'border-amber-300',
    'bg-indigo-100', 'text-indigo-800', 'border-indigo-300',
    'bg-violet-100', 'text-violet-800', 'border-violet-300',
    'bg-sky-100', 'text-sky-800', 'border-sky-300',
    'bg-emerald-100', 'text-emerald-800', 'border-emerald-300',
    'bg-red-100', 'text-red-800', 'border-red-300',
    // Dark mode badge backgrounds
    'dark:bg-slate-900', 'dark:border-slate-700',
    'dark:text-amber-400', 'dark:text-indigo-400', 'dark:text-violet-400',
    'dark:text-sky-400', 'dark:text-emerald-400', 'dark:text-red-400',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default function Logo({ size = 'medium', variant = 'admin' }) {
  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-10 h-10',
    large: 'w-16 h-16'
  }

  const textSize = {
    small: 'text-xs',
    medium: 'text-lg',
    large: 'text-3xl'
  }

  if (variant === 'admin') {
    return (
      <div className={`${sizeClasses[size]} bg-blue-600 rounded-md flex items-center justify-center font-bold text-white shadow`}>
        <span className={textSize[size]}>N</span>
      </div>
    )
  }

  // Shop variant
  return (
    <div className={`${sizeClasses[size]} bg-blue-600 rounded-md flex items-center justify-center font-bold text-white shadow`}>
      <span className={textSize[size]}>N</span>
    </div>
  )
}

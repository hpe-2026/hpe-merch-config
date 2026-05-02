import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { useAuthStore } from '../features/auth/store/authStore'
import './Login.css'

function AuthPage({ onAuthSuccess }) {
  const [isSignup, setIsSignup] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: ''
  })
  const { login, signup } = useAuthStore()

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = isSignup
        ? await signup(formData.email, formData.password, formData.name)
        : await login(formData.email, formData.password)

      if (result.success) {
        onAuthSuccess(result.user)
      } else {
        setError(result.error || (isSignup ? 'Signup failed. Please try again.' : 'Login failed. Please check your credentials.'))
      }
    } catch (err) {
      setError(err.response?.data?.message || (isSignup ? 'Signup failed. Please try again.' : 'Login failed. Please check your credentials.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">
          {isSignup ? 'Create Account' : 'Welcome Back'}
        </h1>
        <p className="login-subtitle">NITTE Merchandise Shop</p>
        
        <form onSubmit={handleSubmit} className="login-form">
          {isSignup && (
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your full name"
                required={isSignup}
                disabled={loading}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder={isSignup ? 'Create a strong password' : 'Enter your password'}
              required
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button 
            type="submit" 
            disabled={loading}
            className="login-button"
          >
            {loading ? (isSignup ? 'Creating Account...' : 'Logging In...') : (isSignup ? 'Sign Up' : 'Login')}
          </button>
        </form>

        <div className="auth-toggle">
          <p>
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <button 
              onClick={() => {
                setIsSignup(!isSignup)
                setError('')
                setFormData({ email: '', password: '', name: '' })
              }}
              className="toggle-link"
              disabled={loading}
            >
              {isSignup ? 'Login' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default AuthPage

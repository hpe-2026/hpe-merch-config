import React from 'react'
import { useAuthStore } from '../../features/auth/store/authStore'

export const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f5f5f5'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2>Access Required</h2>
          <p>You need to be logged in to access this page.</p>
          <a href="/login" style={{
            display: 'inline-block',
            marginTop: '20px',
            padding: '10px 20px',
            background: '#007bff',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px'
          }}>
            Go to Login
          </a>
        </div>
      </div>
    )
  }

  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f5f5f5'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '40px',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h2>Access Denied</h2>
          <p>You do not have permission to access this page.</p>
          <p style={{ color: '#666', fontSize: '14px' }}>
            Required role: {requiredRole} | Your role: {user?.role || 'guest'}
          </p>
          <a href="/" style={{
            display: 'inline-block',
            marginTop: '20px',
            padding: '10px 20px',
            background: '#007bff',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px'
          }}>
            Go Home
          </a>
        </div>
      </div>
    )
  }

  return children
}

export default ProtectedRoute

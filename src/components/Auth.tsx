import { useState, useEffect } from 'react'
import './Auth.css'

interface AuthProps {
  children: React.ReactNode
}

export function Auth({ children }: AuthProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const SECRET_KEY = import.meta.env.VITE_ACCESS_KEY

  useEffect(() => {
    // Check if already authenticated in this session
    const authed = sessionStorage.getItem('evm_tools_authed')
    if (authed === 'true') {
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!SECRET_KEY) {
      setError('Access key not configured. Check environment variables.')
      return
    }

    if (password === SECRET_KEY) {
      sessionStorage.setItem('evm_tools_authed', 'true')
      setIsAuthenticated(true)
      setError('')
    } else {
      setError('Invalid access key')
      setPassword('')
    }
  }

  if (isLoading) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <h1>🔐 EVM Tools</h1>
          <p className="auth-subtitle">Enter access key to continue</p>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Access Key"
              className="auth-input"
              autoFocus
            />

            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="auth-button">
              Unlock
            </button>
          </form>

          <p className="auth-hint">
            Access expires when you close your browser
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

import { useState, useEffect, createContext, useContext } from 'react'
import './Auth.css'

interface AuthProps {
  children: React.ReactNode
}

interface AuthContextType {
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within Auth provider')
  }
  return context
}

// Helper to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Helper to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export function Auth({ children }: AuthProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)

  useEffect(() => {
    // Check if already authenticated in this session
    const authed = sessionStorage.getItem('evm_tools_authed')
    if (authed === 'true') {
      setIsAuthenticated(true)
      setIsLoading(false)
      return
    }

    // Check if user has registered a passkey
    const credentialId = localStorage.getItem('evm_tools_credential_id')
    setHasPasskey(!!credentialId)
    setIsLoading(false)

    // Auto-trigger authentication if passkey exists
    if (credentialId) {
      // Small delay to let UI render
      setTimeout(() => handleAuthenticate(), 100)
    }
  }, [])

  const handleRegister = async () => {
    setIsRegistering(true)
    setError('')

    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('Passkeys are not supported in this browser')
      }

      // Generate a challenge (in production, this should come from server)
      const challenge = crypto.getRandomValues(new Uint8Array(32))

      // Create credential options
      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: challenge,
        rp: {
          name: 'EVM Tools',
          id: window.location.hostname,
        },
        user: {
          id: crypto.getRandomValues(new Uint8Array(32)),
          name: 'evm-tools-user',
          displayName: 'EVM Tools User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Prefer platform authenticator (Touch ID, etc)
          requireResidentKey: false,
          userVerification: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      }

      // Create credential
      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      }) as PublicKeyCredential

      if (!credential) {
        throw new Error('Failed to create credential')
      }

      // Store credential ID
      const credentialId = arrayBufferToBase64(credential.rawId)
      localStorage.setItem('evm_tools_credential_id', credentialId)

      // Also store the public key for verification
      const response = credential.response as AuthenticatorAttestationResponse
      const publicKey = arrayBufferToBase64(response.getPublicKey()!)
      localStorage.setItem('evm_tools_public_key', publicKey)

      setHasPasskey(true)
      setError('')

      // Authenticate immediately
      sessionStorage.setItem('evm_tools_authed', 'true')
      setIsAuthenticated(true)
    } catch (err: any) {
      console.error('Registration error:', err)
      if (err.name === 'NotAllowedError') {
        setError('Authentication cancelled')
      } else {
        setError(`Registration failed: ${err.message}`)
      }
    } finally {
      setIsRegistering(false)
    }
  }

  const handleAuthenticate = async () => {
    setError('')

    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('Passkeys are not supported in this browser')
      }

      const storedCredentialId = localStorage.getItem('evm_tools_credential_id')
      if (!storedCredentialId) {
        throw new Error('No passkey registered')
      }

      // Generate a challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32))

      // Create authentication options
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: challenge,
        allowCredentials: [
          {
            id: base64ToArrayBuffer(storedCredentialId),
            type: 'public-key',
          },
        ],
        timeout: 60000,
        userVerification: 'preferred',
      }

      // Get credential
      const credential = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      }) as PublicKeyCredential

      if (!credential) {
        throw new Error('Authentication failed')
      }

      // Successful authentication
      sessionStorage.setItem('evm_tools_authed', 'true')
      setIsAuthenticated(true)
      setError('')
    } catch (err: any) {
      console.error('Authentication error:', err)
      if (err.name === 'NotAllowedError') {
        setError('Authentication cancelled')
      } else if (err.message === 'No passkey registered') {
        setError('Please register a passkey first')
        setHasPasskey(false)
      } else {
        setError(`Authentication failed: ${err.message}`)
      }
    }
  }

  const logout = () => {
    localStorage.removeItem('evm_tools_credential_id')
    localStorage.removeItem('evm_tools_public_key')
    sessionStorage.removeItem('evm_tools_authed')
    setHasPasskey(false)
    setIsAuthenticated(false)
    setError('')
  }

  if (isLoading) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <div className="loading-spinner"></div>
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

          {!hasPasskey ? (
            <>
              <p className="auth-subtitle">First-time setup</p>
              <p className="auth-description">
                Register your device using Touch ID, Face ID, or your security key
              </p>

              <button
                onClick={handleRegister}
                disabled={isRegistering}
                className="auth-button"
              >
                {isRegistering ? 'Registering...' : '✨ Register Passkey'}
              </button>

              <p className="auth-hint">
                Your passkey is stored securely on your device and syncs across your devices via iCloud or Google
              </p>
            </>
          ) : (
            <>
              <p className="auth-subtitle">Unlock with your passkey</p>

              <button onClick={handleAuthenticate} className="auth-button">
                🔓 Unlock with Touch ID
              </button>

              <p className="auth-hint">
                Authentication expires when you close your browser
              </p>
            </>
          )}

          {error && <p className="auth-error">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ logout }}>
      {children}
    </AuthContext.Provider>
  )
}

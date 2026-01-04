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
  const [registrationCode, setRegistrationCode] = useState('')

  useEffect(() => {
    // Check if already authenticated in this session
    const authed = sessionStorage.getItem('evm_tools_authed')
    if (authed === 'true') {
      setIsAuthenticated(true)
      setIsLoading(false)
      return
    }

    // Check if user has registered passkey(s) - support multiple credentials
    const credentialIds = localStorage.getItem('evm_tools_credential_ids')
    const hasCredentials = !!credentialIds
    setHasPasskey(hasCredentials)
    setIsLoading(false)

    // Auto-trigger authentication if passkey exists
    if (hasCredentials) {
      // Small delay to let UI render
      setTimeout(() => handleAuthenticate(), 100)
    }
  }, [])

  const handleRegister = async () => {
    setIsRegistering(true)
    setError('')

    try {
      // Verify registration code
      const REGISTRATION_CODE = import.meta.env.VITE_REGISTRATION_CODE
      if (!REGISTRATION_CODE) {
        throw new Error('Registration code not configured')
      }

      if (registrationCode !== REGISTRATION_CODE) {
        throw new Error('Invalid registration code')
      }

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

      // Store credential ID (support multiple)
      const credentialId = arrayBufferToBase64(credential.rawId)
      const existingIds = localStorage.getItem('evm_tools_credential_ids')
      const credentialIds = existingIds ? JSON.parse(existingIds) : []

      // Add new credential ID if not already present
      if (!credentialIds.includes(credentialId)) {
        credentialIds.push(credentialId)
        localStorage.setItem('evm_tools_credential_ids', JSON.stringify(credentialIds))
      }

      // Also store the public key for reference (optional)
      const response = credential.response as AuthenticatorAttestationResponse
      const publicKey = arrayBufferToBase64(response.getPublicKey()!)
      const existingKeys = localStorage.getItem('evm_tools_public_keys')
      const publicKeys = existingKeys ? JSON.parse(existingKeys) : []
      if (!publicKeys.includes(publicKey)) {
        publicKeys.push(publicKey)
        localStorage.setItem('evm_tools_public_keys', JSON.stringify(publicKeys))
      }

      setHasPasskey(true)
      setError('')
      setRegistrationCode('')

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

      const storedIds = localStorage.getItem('evm_tools_credential_ids')
      if (!storedIds) {
        throw new Error('No passkey registered')
      }

      const credentialIds = JSON.parse(storedIds)
      if (!credentialIds || credentialIds.length === 0) {
        throw new Error('No passkey registered')
      }

      // Generate a challenge
      const challenge = crypto.getRandomValues(new Uint8Array(32))

      // Create authentication options with all stored credentials
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: challenge,
        allowCredentials: credentialIds.map((id: string) => ({
          id: base64ToArrayBuffer(id),
          type: 'public-key' as const,
        })),
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
    localStorage.removeItem('evm_tools_credential_ids')
    localStorage.removeItem('evm_tools_public_keys')
    localStorage.removeItem('evm_tools_credential_id') // Legacy support
    localStorage.removeItem('evm_tools_public_key') // Legacy support
    localStorage.removeItem('evm_tools_registration_locked') // Legacy support
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
          <div className="auth-header">
            <img src="/logo.jpg" alt="Deadpool" className="auth-logo" />
            <h1>EVM Tools</h1>
          </div>

          {!hasPasskey ? (
            <>
              <p className="auth-subtitle">Register New Passkey</p>

              <p className="auth-description">
                Enter the registration code to register your passkey
              </p>

              <input
                type="password"
                value={registrationCode}
                onChange={(e) => setRegistrationCode(e.target.value)}
                placeholder="Registration Code"
                className="auth-input"
                disabled={isRegistering}
              />

              <button
                onClick={handleRegister}
                disabled={isRegistering || !registrationCode}
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

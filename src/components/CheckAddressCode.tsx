import { useState } from 'react'
import { ethers } from 'ethers'
import './CheckAddressCode.css'

interface CheckAddressCodeProps {
  rpcUrl: string
}

export function CheckAddressCode({ rpcUrl }: CheckAddressCodeProps) {
  const [address, setAddress] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkAddress = async () => {
    if (!address) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Validate address
      if (!ethers.isAddress(address)) {
        throw new Error('Invalid address format')
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl)
      
      // Get the code at the address
      const code = await provider.getCode(address)

      // Determine the type based on the code
      if (!code || code === '0x' || code === '0x0') {
        // No code - it's an EOA
        setResult('EOA')
      } else if (code.startsWith('0xef0100')) {
        // EIP-7702 magic prefix detected
        setResult('EOA+7702')
      } else {
        // Has code but not EIP-7702 - it's a contract
        setResult('Contract')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to check address')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="check-address-code">
      <h2>Check Address Code</h2>
      
      <div className="form-group">
        <label htmlFor="address-input">Address</label>
        <input
          id="address-input"
          type="text"
          placeholder="0x..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              checkAddress()
            }
          }}
        />
      </div>

      <button
        className="check-button"
        onClick={checkAddress}
        disabled={!address || loading}
      >
        {loading ? 'Checking...' : 'Check Address'}
      </button>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {result && (
        <div className="result">
          <h3>Result:</h3>
          <div className={`result-badge result-badge-${result.toLowerCase().replace('+', '-')}`}>
            {result}
          </div>
        </div>
      )}
    </div>
  )
}


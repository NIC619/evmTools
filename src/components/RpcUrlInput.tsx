import { useState, useEffect } from 'react'
import './RpcUrlInput.css'

const BUILT_IN_RPC_URLS = [
  { name: 'Ethereum Mainnet', url: 'https://ethereum-rpc.publicnode.com' },
  { name: 'Ethereum Sepolia', url: 'https://ethereum-sepolia-rpc.publicnode.com' },
  { name: 'Ethereum Hoodi', url: 'https://ethereum-hoodi-rpc.publicnode.com' },
  { name: 'UniFi Testnet', url: 'https://testnet-unifi-rpc.puffer.fi/' },
  { name: 'Arbitrum', url: 'https://arb1.arbitrum.io/rpc' },
  { name: 'Optimism', url: 'https://mainnet.optimism.io' },
  { name: 'Base', url: 'https://mainnet.base.org' },
]

const STORAGE_KEY = 'evm-tools-custom-rpc-urls'

interface RpcUrlInputProps {
  value: string
  onChange: (url: string) => void
}

export function RpcUrlInput({ value, onChange }: RpcUrlInputProps) {
  const [customUrls, setCustomUrls] = useState<string[]>([])
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customInput, setCustomInput] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const urls = JSON.parse(stored)
        setCustomUrls(urls)
      } catch (e) {
        console.error('Failed to parse stored RPC URLs', e)
      }
    }
  }, [])

  const allUrls = [...BUILT_IN_RPC_URLS, ...customUrls.map(url => ({ name: url, url }))]

  const handleSelect = (url: string) => {
    onChange(url)
    setShowCustomInput(false)
    setCustomInput('')
  }

  const handleAddCustom = () => {
    if (customInput.trim() && !customUrls.includes(customInput.trim())) {
      const newUrls = [...customUrls, customInput.trim()]
      setCustomUrls(newUrls)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUrls))
      onChange(customInput.trim())
      setCustomInput('')
      setShowCustomInput(false)
    }
  }

  const handleRemoveCustom = (urlToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newUrls = customUrls.filter(url => url !== urlToRemove)
    setCustomUrls(newUrls)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUrls))
    if (value === urlToRemove) {
      onChange('')
    }
  }

  return (
    <div className="rpc-url-input">
      <div className="rpc-url-selector">
        <label>RPC URL:</label>
        <div className="rpc-url-options">
          {allUrls.map((item, index) => (
            <button
              key={index}
              className={`rpc-url-option ${value === item.url ? 'active' : ''}`}
              onClick={() => handleSelect(item.url)}
            >
              <span className="rpc-url-name">{item.name}</span>
              {customUrls.includes(item.url) && (
                <button
                  className="remove-url-btn"
                  onClick={(e) => handleRemoveCustom(item.url, e)}
                  title="Remove"
                >
                  ×
                </button>
              )}
            </button>
          ))}
          <button
            className="rpc-url-option add-custom-btn"
            onClick={() => setShowCustomInput(!showCustomInput)}
          >
            {showCustomInput ? '−' : '+'} Custom URL
          </button>
        </div>
      </div>
      {showCustomInput && (
        <div className="custom-url-input">
          <input
            type="text"
            placeholder="Enter RPC URL (e.g., https://eth.llamarpc.com)"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddCustom()
              }
            }}
          />
          <button onClick={handleAddCustom}>Add</button>
        </div>
      )}
      {value && (
        <div className="current-rpc-url">
          <strong>Current:</strong> <code>{value}</code>
        </div>
      )}
    </div>
  )
}


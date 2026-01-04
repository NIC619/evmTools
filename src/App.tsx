import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Auth, useAuth } from './components/Auth'
import { RpcUrlInput } from './components/RpcUrlInput'
import { QueryContract } from './components/QueryContract'
import { CheckAddressCode } from './components/CheckAddressCode'
import { ParseCalldata } from './components/ParseCalldata'
import './App.css'

const queryClient = new QueryClient()

function AppContent() {
  const [rpcUrl, setRpcUrl] = useState<string>('')
  const { logout } = useAuth()

  const handleRpcUrlChange = (url: string) => {
    setRpcUrl(url)
  }

  const handleLogout = () => {
    if (confirm('Reset passkey and logout?\n\nYou will need to register your passkey again on next visit.')) {
      logout()
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        <header className="app-header">
          <h1>EVM Tools</h1>
          <RpcUrlInput
            value={rpcUrl}
            onChange={handleRpcUrlChange}
          />
          <button onClick={handleLogout} className="logout-button" title="Reset passkey and logout">
            ⚙️ Reset & Logout
          </button>
        </header>
          <main className="app-main">
            <div className="tools-container">
              <ParseCalldata />
              {rpcUrl ? (
                <>
                  <QueryContract rpcUrl={rpcUrl} />
                  <CheckAddressCode rpcUrl={rpcUrl} />
                </>
              ) : (
                <div className="welcome-message">
                  <p>Select or enter an RPC URL to use contract query and address checking tools</p>
                </div>
              )}
            </div>
          </main>
        </div>
      </QueryClientProvider>
  )
}

function App() {
  return (
    <Auth>
      <AppContent />
    </Auth>
  )
}

export default App


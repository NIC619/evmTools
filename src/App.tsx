import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RpcUrlInput } from './components/RpcUrlInput'
import { QueryContract } from './components/QueryContract'
import { CheckAddressCode } from './components/CheckAddressCode'
import { ParseCalldata } from './components/ParseCalldata'
import './App.css'

const queryClient = new QueryClient()

function App() {
  const [rpcUrl, setRpcUrl] = useState<string>('')

  const handleRpcUrlChange = (url: string) => {
    setRpcUrl(url)
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

export default App


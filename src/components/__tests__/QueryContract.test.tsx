import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryContract } from '../QueryContract'

// Basic rendering tests
describe('QueryContract Component', () => {
  it('renders without crashing', () => {
    render(<QueryContract rpcUrl="http://localhost:8545" />)
    // Component renders successfully (just check that there's a query button)
    const queryButtons = screen.getAllByText(/Query Contract/i)
    expect(queryButtons.length).toBeGreaterThan(0)
  })

  it('shows all three input mode options', () => {
    render(<QueryContract rpcUrl="http://localhost:8545" />)
    // Check for radio button labels
    const functionDefLabel = screen.getAllByText(/Function Definition/i)[0]
    const abiJsonLabel = screen.getAllByText(/ABI JSON/i)[0]
    const solidityContractLabel = screen.getAllByText(/Solidity Contract/i)[0]

    expect(functionDefLabel).toBeInTheDocument()
    expect(abiJsonLabel).toBeInTheDocument()
    expect(solidityContractLabel).toBeInTheDocument()
  })
})

// Note: More comprehensive parsing tests will be added in Phase 2
// when we extract the parsing logic into separate utilities that can be tested independently

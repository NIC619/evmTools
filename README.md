# EVM Tools

A frontend application for quickly interacting with bytecode, contracts, and environment in EVM chains using wagmi and ethers.js.

## Features

- **RPC URL Management**: Select from built-in RPC URLs or add custom ones
- **Query Contract**: Query contract functions using either:
  - Function definitions (e.g., `address public immutable override p256;`)
  - ABI JSON with function selection dropdown

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Usage

1. Select or enter an RPC URL at the top of the page
2. Use the "Query Contract" tool to interact with contracts:
   - Enter the contract address
   - Choose between function definition or ABI JSON input
   - Select a function (if using ABI)
   - Enter function arguments if needed
   - Click "Query Contract" to execute

## Technologies

- React + TypeScript
- Vite
- wagmi
- ethers.js
- TanStack Query


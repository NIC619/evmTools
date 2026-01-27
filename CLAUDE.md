# EVM Tools

A personal React frontend for EVM (Ethereum Virtual Machine) development tools, deployed on Vercel with passkey authentication.

## Project Overview

- **Framework**: React 18 + TypeScript + Vite
- **Deployment**: Vercel (with serverless functions)
- **Authentication**: WebAuthn Passkey (Touch ID / Face ID)

## Key Features

1. **Parse Calldata** - Decode EVM transaction calldata
2. **Query Contract** - Query smart contract functions with Solidity parsing
3. **Check Address Code** - Determine if address is EOA, Contract, or EIP-7702 delegated account

## Project Structure

```
├── api/                          # Vercel serverless functions
│   └── verify-registration-code.ts  # Server-side registration code validation
├── public/
│   └── logo.jpg                  # Deadpool logo
├── src/
│   ├── components/
│   │   ├── Auth.tsx              # Passkey authentication component
│   │   ├── Auth.css
│   │   ├── CheckAddressCode.tsx  # EIP-7702 detection
│   │   ├── CheckAddressCode.css
│   │   ├── ParseCalldata.tsx     # Calldata decoder
│   │   ├── QueryContract.tsx     # Contract query tool
│   │   └── RpcUrlInput.tsx       # RPC URL input
│   ├── utils/
│   │   └── solidity/             # Solidity parsing utilities
│   │       ├── contractParser.ts
│   │       ├── mappingParser.ts
│   │       ├── parameterParser.ts
│   │       └── types.ts
│   ├── App.tsx
│   ├── App.css
│   └── vite-env.d.ts             # Environment variable types
├── .env.local                    # Local dev environment (gitignored)
├── .env.example                  # Environment template
└── index.html
```

## Authentication Flow

### Production (Vercel)
1. User enters registration code
2. Code verified via `/api/verify-registration-code` serverless function
3. Server checks against `REGISTRATION_CODE` env var (never exposed to client)
4. On success, WebAuthn passkey registration proceeds
5. Subsequent visits authenticate via passkey (Touch ID/Face ID)

### Local Development
- Set `VITE_DISABLE_AUTH=true` in `.env.local` to bypass authentication
- Falls back to `VITE_REGISTRATION_CODE` if auth enabled but API unavailable

## Environment Variables

### Local Development (`.env.local`)
```bash
VITE_DISABLE_AUTH=true           # Skip auth in development
VITE_REGISTRATION_CODE=localtest  # Fallback for local testing
```

### Production (Vercel Dashboard)
```bash
REGISTRATION_CODE=your-secret    # Server-side only, NOT exposed to client
```

## EIP-7702 Support

The "Check Address Code" tool detects EIP-7702 delegated accounts:
- **Code format**: `0xef0100` + `<20 bytes delegated address>`
- Extracts and displays the delegated implementation address
- Example: `0xe199225517a1770346bb549Bc9C5F47a82494b6f` on Sepolia

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run test     # Run tests
```

## Important Notes

- All `VITE_` prefixed env vars are exposed to the client (bundled into JS)
- Use non-prefixed env vars in Vercel for secrets (only accessible in serverless functions)
- Passkeys sync within browser families (Chrome→Chrome, Safari→Safari) but not across
- Reset & Logout button only clears passkey for the current browser

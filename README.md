# EVM Tools

A personal React frontend for EVM (Ethereum Virtual Machine) development tools, deployed on Vercel with passkey authentication.

## Features

- **Parse Calldata** - Decode EVM transaction calldata (network-free)
- **Upload Function Selectors** - Derive 4-byte selectors from Solidity source and upload to [4byte.sourcify.dev](https://4byte.sourcify.dev); supports structs, user-defined value types, qualified type names, and public state variable getters (network-free)
- **Query Contract** - Query smart contract view/pure functions with Solidity parsing (supports function definitions and ABI JSON)
- **Check Address Code** - Determine if an address is EOA, Contract, or EIP-7702 delegated account

## Tech Stack

- React 18 + TypeScript + Vite
- Deployed on Vercel (with serverless functions)
- WebAuthn Passkey authentication (Touch ID / Face ID)

## Getting Started

### Installation

```bash
npm install
```

### Local Development

```bash
cp .env.example .env.local
# Edit .env.local - set VITE_DISABLE_AUTH=true to skip auth locally
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm run test
```

## Environment Variables

See `.env.example` for the full template.

### Local Development (`.env.local`)

| Variable | Description |
|---|---|
| `VITE_DISABLE_AUTH=true` | Skip authentication in development |
| `VITE_REGISTRATION_CODE` | Fallback registration code for local testing |

### Production (Vercel Dashboard)

| Variable | Description |
|---|---|
| `REGISTRATION_CODE` | Server-side secret for passkey registration |
| `DISABLE_REGISTRATION=true` | Block new passkey registrations (optional) |

## Authentication

- **Production**: Registration code verified server-side via `/api/verify-registration-code`, then WebAuthn passkey registration
- **Local dev**: Set `VITE_DISABLE_AUTH=true` to bypass, or use `VITE_REGISTRATION_CODE` for local testing
- **Disable registration**: Set `DISABLE_REGISTRATION=true` on Vercel after registering your own passkey

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full deployment guide.

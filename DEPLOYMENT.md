# Deployment Guide - Vercel with Passkey Authentication

## How It Works

- **First visit**: Enter registration code, then register your passkey (Touch ID, Face ID, or security key)
- **Subsequent visits**: Auto-prompts for Touch ID/Face ID
- **Syncs across devices**: via iCloud Keychain or Google Password Manager
- **Session-based**: Authentication expires when browser closes

## Deploy to Vercel

### 1. Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

### 2. Set Up on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Add New Project" and import your repository
3. Configure:
   - Framework Preset: **Vite** (should auto-detect)
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Add environment variables:
   - `REGISTRATION_CODE` = your secret registration code
5. Click "Deploy"

### 3. Register Your Passkey

1. Visit your Vercel URL
2. Enter your registration code
3. Browser prompts for Touch ID/Face ID
4. You're in!

### 4. Lock Down Registration (Recommended)

After registering your own passkey, disable new registrations:

1. Go to Vercel Dashboard > Project Settings > Environment Variables
2. Add `DISABLE_REGISTRATION` = `true`
3. Redeploy (or takes effect on next deploy)

To re-enable registration later, remove the variable or set it to any value other than `true`.

## Auto-Deploy

Pushing to GitHub triggers automatic redeployment:

```bash
git add .
git commit -m "Update feature"
git push
```

## Managing Passkeys

### Reset Passkey
1. Visit your app
2. Click "Reset & Logout"
3. Re-register with your registration code (requires `DISABLE_REGISTRATION` to be unset)

### Cross-Device Access
- **Apple**: Syncs via iCloud Keychain
- **Google/Android**: Syncs via Google Password Manager
- **Security keys**: Can be used on any device (YubiKey, etc.)

## Local Development

Set up `.env.local` for local testing:

```bash
VITE_DISABLE_AUTH=true            # Skip auth entirely
VITE_REGISTRATION_CODE=localtest  # Or test registration locally
```

The `DISABLE_REGISTRATION` env var only affects the Vercel serverless function, so local dev registration is never blocked.

## Troubleshooting

### "Passkeys are not supported in this browser"
- Safari: macOS 13+ / iOS 16+
- Chrome: version 108+
- Firefox: version 119+
- Edge: version 108+

### Touch ID/Face ID not prompting
1. Check browser console for errors
2. Clear localStorage: DevTools > Application > Local Storage > Delete all
3. Click "Reset & Logout" and re-register
4. Ensure Touch ID/Face ID is enabled in System Settings

### "Registration is currently disabled"
- `DISABLE_REGISTRATION=true` is set on Vercel
- Remove it from Vercel environment variables and redeploy to allow new registrations

### Passkey not syncing to other devices
- Ensure iCloud Keychain (Apple) or Password Manager sync (Google) is enabled
- Give it a few minutes to sync
- Try registering directly on the new device if needed

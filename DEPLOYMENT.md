# Deployment Guide - Vercel with Passkey Authentication

## ✅ Setup Complete!

Your app now has **Passkey (WebAuthn) authentication** - the most secure and convenient option.

---

## 🔐 How It Works

- **First visit**: Register your passkey (Touch ID, Face ID, or security key)
- **Subsequent visits**: Auto-prompts for Touch ID/Face ID
- **Syncs across devices**: via iCloud Keychain or Google Password Manager
- **Cannot be brute forced**: Uses public key cryptography
- **No environment variables needed**: Everything stored locally on your devices

---

## 🧪 Test Locally

1. **Start the dev server**:
   ```bash
   npm run dev
   ```

2. **Test the Passkey auth**:
   - Visit http://localhost:5173
   - Click "Register Passkey"
   - Browser prompts for Touch ID/Face ID
   - Access granted!
   - Close browser → try again → Touch ID auto-prompts

3. **Test cross-device sync** (optional):
   - Access the same localhost from another device on your network
   - Your passkey should sync automatically (if using iCloud/Google)

---

## 🚀 Deploy to Vercel

### 1. Push to GitHub

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Add authentication and prepare for deployment"

# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

### 2. Deploy to Vercel

1. **Go to [vercel.com](https://vercel.com)**
2. **Sign in with GitHub**
3. **Click "Add New Project"**
4. **Import your GitHub repository**
5. **Configure the project**:
   - Framework Preset: **Vite** (should auto-detect)
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `dist`

6. **Click "Deploy"** (no environment variables needed!)
7. **Wait 1-2 minutes** for deployment to complete
8. **You'll get a URL** like: `https://your-app-xyz.vercel.app`

### 3. Test Your Deployment

1. Visit your Vercel URL
2. Click "Register Passkey"
3. Browser prompts for Touch ID/Face ID
4. Start using your tools!
5. **On other devices**: Visit the same URL → Your passkey syncs automatically!

---

## 🔄 Auto-Deploy Updates

Now whenever you push to GitHub:

```bash
git add .
git commit -m "Update feature"
git push
```

Vercel will **automatically rebuild and redeploy** your app in ~1 minute!

---

## 🔑 Managing Your Passkey

### Reset Passkey:
If you need to re-register (e.g., new device, lost access):
1. Visit your app
2. Click "Reset Passkey" button
3. Click "Register Passkey" again

### Cross-Device Access:
- **Apple devices**: Passkeys sync via iCloud Keychain automatically
- **Google/Android**: Passkeys sync via Google Password Manager
- **Security keys**: Can be used on any device (YubiKey, etc.)

---

## 🛡️ Security Notes

### What Passkey Auth Provides:
✅ **Phishing-resistant**: Domain-bound, can't be tricked
✅ **Brute-force proof**: Public key cryptography, no password to guess
✅ **Hardware-backed**: Uses device's secure enclave (Touch ID sensor, etc.)
✅ **Syncs securely**: End-to-end encrypted sync via iCloud/Google
✅ **No shared secrets**: Private key never leaves your device
✅ **Session-based**: Authentication expires when browser closes

### Perfect For:
✅ Personal tools (single user)
✅ High-value targets (crypto tools)
✅ Mobile + desktop access
✅ No passwords to remember

### Additional Security:
1. **URL privacy**: Don't share your Vercel URL publicly
2. **Vercel URLs are random**: `my-app-a8f9x2j.vercel.app` (hard to guess)
3. **Add custom domain** (optional): More professional, easier to remember
4. **Backup**: Register passkey on multiple devices in case one is lost

---

## 📝 Vercel Dashboard Overview

After deployment, you can:

- **View logs**: Deployments → Select deployment → View Function Logs
- **Custom domain**: Settings → Domains → Add your own domain
- **Analytics**: See usage stats (free tier: limited)
- **Environment variables**: Settings → Environment Variables

---

## ❓ Troubleshooting

### "Passkeys are not supported in this browser":
- **Safari**: Works on macOS 13+ and iOS 16+
- **Chrome**: Works on version 108+
- **Firefox**: Works on version 119+
- **Edge**: Works on version 108+
- Try updating your browser or use a modern browser

### Touch ID/Face ID not prompting:
1. Check browser console for errors
2. Try clearing localStorage: DevTools → Application → Local Storage → Delete all
3. Click "Reset Passkey" and re-register
4. Make sure Touch ID/Face ID is enabled in System Settings

### "Authentication failed" error:
- Try clicking "Reset Passkey" and re-register
- Check if another browser/device registered the passkey first
- Clear browser data and try again

### Passkey not syncing to other devices:
- **Apple**: Ensure iCloud Keychain is enabled in Settings
- **Google**: Ensure Password Manager sync is enabled
- Give it a few minutes to sync (not instant)
- Try manually registering on the new device if needed

---

## 🎉 You're Done!

Your EVM Tools app is now:
- ✅ **Passkey protected** (Touch ID/Face ID)
- ✅ **Deployed to Vercel**
- ✅ **Auto-deploys** on git push
- ✅ **Accessible from anywhere**
- ✅ **Syncs across devices**
- ✅ **Brute-force proof**

**Your app URL**: Check Vercel dashboard after deployment

Just Touch ID and you're in! Enjoy your personal EVM tools! 🚀

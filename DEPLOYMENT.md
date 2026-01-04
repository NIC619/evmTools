# Deployment Guide - Vercel with Authentication

## ✅ Setup Complete!

Your app now has password protection using environment-based authentication.

---

## 🔐 How It Works

- Users must enter an access key to use the app
- Authentication expires when the browser is closed (sessionStorage)
- The secret key is stored in environment variables (never committed to git)

---

## 🧪 Test Locally

1. **Set your access key** (already done):
   ```bash
   # File: .env.local
   VITE_ACCESS_KEY=your-secret-key-here
   ```

   ⚠️ **Change `your-secret-key-here` to your own strong password!**

2. **Start the dev server**:
   ```bash
   npm run dev
   ```

3. **Test the auth**:
   - Visit http://localhost:5173
   - You should see a password prompt
   - Enter the key from `.env.local`
   - You should be able to access the app

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

6. **⚠️ IMPORTANT: Set Environment Variable**
   - Before clicking "Deploy", click **"Environment Variables"**
   - Add variable:
     - **Name**: `VITE_ACCESS_KEY`
     - **Value**: Your secret password (choose a strong one!)
     - **Environment**: Production (default)

7. **Click "Deploy"**
8. **Wait 1-2 minutes** for deployment to complete
9. **You'll get a URL** like: `https://your-app-xyz.vercel.app`

### 3. Test Your Deployment

1. Visit your Vercel URL
2. Enter your access key
3. Start using your tools!

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

## 🔑 Updating Your Access Key

### Locally (for development):
Edit `.env.local` and restart the dev server

### On Vercel (for production):
1. Go to your project on vercel.com
2. Click **Settings** → **Environment Variables**
3. Find `VITE_ACCESS_KEY`
4. Click **Edit** → Update the value
5. **Redeploy**: Go to **Deployments** → Click "..." on latest → "Redeploy"

---

## 🛡️ Security Notes

### What This Auth Provides:
✅ Prevents casual access
✅ Good for personal/private tools
✅ Access key never exposed in code
✅ Session expires when browser closes

### What This Auth Does NOT Provide:
❌ Enterprise-grade security
❌ User management
❌ Rate limiting
❌ Audit logging

### Additional Security Tips:
1. **Use a strong access key** (20+ random characters)
2. **Don't share the URL publicly**
3. **Vercel URLs are hard to guess** (e.g., `my-app-a8f9x2j.vercel.app`)
4. **For sensitive work**: Consider Vercel Pro ($20/mo) which has:
   - Built-in password protection
   - IP whitelisting
   - Team access controls

---

## 📝 Vercel Dashboard Overview

After deployment, you can:

- **View logs**: Deployments → Select deployment → View Function Logs
- **Custom domain**: Settings → Domains → Add your own domain
- **Analytics**: See usage stats (free tier: limited)
- **Environment variables**: Settings → Environment Variables

---

## ❓ Troubleshooting

### Auth not working on Vercel:
1. Check environment variable is set: Settings → Environment Variables
2. Variable must be named exactly: `VITE_ACCESS_KEY`
3. Redeploy after adding/changing env vars

### App loads but no password prompt:
- Check browser console for errors
- Verify `.env.local` exists and has `VITE_ACCESS_KEY` set

### "Invalid access key" even with correct password:
- Check for extra spaces in `.env.local`
- Ensure no quotes around the value: `VITE_ACCESS_KEY=mykey` (not `"mykey"`)

---

## 🎉 You're Done!

Your EVM Tools app is now:
- ✅ Password protected
- ✅ Deployed to Vercel
- ✅ Auto-deploys on git push
- ✅ Accessible from anywhere

**Your app URL**: Check Vercel dashboard after deployment

Enjoy your personal EVM tools! 🚀

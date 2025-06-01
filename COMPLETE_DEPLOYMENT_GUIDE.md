# 🚀 VoxInbox Deployment Guide
## Vercel (Frontend) + Railway (Backend) + Custom Domain

### 📋 Prerequisites
- GitHub account with your VoxInbox repository
- Vercel account (free)
- Railway account (free tier)
- Custom domain: `kunalis.me` 
- Google OAuth credentials
- OpenAI API key

---

## 🧹 **Step 1: Clean Up Project**

```bash
# Make cleanup script executable and run it
chmod +x cleanup.sh
./cleanup.sh

# Commit the cleaned up project
git add .
git commit -m "🧹 Clean up unused files and optimize for deployment"
git push origin main
```

---

## 🚂 **Step 2: Deploy Backend to Railway**

### 2.1 Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Sign up/Login with GitHub
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Choose your `VoxInbox` repository
6. Railway will auto-detect Python and use the nixpacks.toml config

### 2.2 Configure Environment Variables
In Railway dashboard → **Variables** tab, add:

```bash
# Required Environment Variables
OPENAI_API_KEY=sk-proj-your-openai-key-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
SECRET_KEY=your-super-secret-jwt-key-min-32-chars

# Frontend URL (add after frontend deployment)
FRONTEND_URL=https://kunalis.me/voxinbox
```

### 2.3 Note Your Railway URL
After deployment completes, Railway will provide a URL like:
```
https://voxinbox-backend-production.railway.app
```
**Save this URL - you'll need it for frontend configuration.**

---

## ⚡ **Step 3: Deploy Frontend to Vercel**

### 3.1 Create Vercel Project
1. Go to [vercel.com](https://vercel.com)
2. Sign up/Login with GitHub
3. Click **"New Project"**
4. Import your `VoxInbox` repository
5. Vercel will auto-detect React and use the vercel.json config

### 3.2 Configure Environment Variables
In Vercel dashboard → **Settings** → **Environment Variables**, add:

```bash
# Replace with your actual Railway URL
VITE_API_BASE_URL=https://voxinbox-backend-production.railway.app
VITE_WS_BASE_URL=wss://voxinbox-backend-production.railway.app
VITE_ENV=production
```

### 3.3 Configure Custom Domain
1. In Vercel dashboard → **Settings** → **Domains**
2. Click **"Add Domain"**
3. **Choose one option:**

#### Option A: Subdomain (Recommended)
```bash
Domain: voxinbox.kunalis.me
```

#### Option B: Path-based
```bash
Domain: kunalis.me/voxinbox  
# Note: This requires additional configuration
```

4. Follow Vercel's DNS instructions:

#### DNS Configuration (in your domain provider):
```bash
# For subdomain option (voxinbox.kunalis.me):
Type: CNAME
Name: voxinbox  
Value: cname.vercel-dns.com

# For main domain with path:
Type: CNAME
Name: @
Value: cname.vercel-dns.com
```

### 3.4 Update Frontend URL in Railway
Go back to Railway → **Variables** and update:
```bash
# For subdomain option:
FRONTEND_URL=https://voxinbox.kunalis.me

# For path-based option:
FRONTEND_URL=https://kunalis.me/voxinbox
```

---

## 🔒 **Step 4: Configure Google OAuth**

### 4.1 Update Google Cloud Console
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Edit your OAuth 2.0 Client ID

### 4.2 Add Authorized Origins
```bash
https://kunalis.me
https://voxinbox-backend-production.railway.app
```

### 4.3 Add Authorized Redirect URIs
```bash
https://voxinbox-backend-production.railway.app/oauth2callback
```

---

## 🎯 **Step 5: Update CORS in Backend**

Make sure your `backend/main.py` has the correct CORS configuration:

```python
# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Development
        "https://kunalis.me",     # Production domain
        "https://voxinbox-backend-production.railway.app"  # Backend
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Commit and push this change:
```bash
git add backend/main.py
git commit -m "🔧 Update CORS for production domain"
git push origin main
```

---

## 📱 **Step 6: Test Your Deployment**

### 6.1 Access Your PWA
Visit: **https://kunalis.me/voxinbox**

### 6.2 Test Core Functionality
- [ ] **Login Flow**: Google OAuth works
- [ ] **WebSocket Connection**: Real-time communication
- [ ] **Voice Commands**: Microphone and voice processing
- [ ] **PWA Features**: "Add to Home Screen" appears on mobile

### 6.3 Test PWA Installation
**On Mobile:**
1. Visit `https://kunalis.me/voxinbox`
2. Look for "Add to Home Screen" banner
3. Install and test offline functionality

**On Desktop:**
1. Look for install icon in browser address bar
2. Install as desktop app

---

## 🛠 **Step 7: Troubleshooting**

### Common Issues & Solutions

**🔗 WebSocket Connection Failed**
```bash
# Check Railway logs
railway logs

# Verify WebSocket URL in Vercel env vars
wss://your-railway-app.railway.app
```

**🔐 OAuth Login Failed**
```bash
# Verify Google Console settings:
- Authorized Origins include your domain
- Redirect URIs point to Railway backend
- Client ID/Secret match environment variables
```

**🎤 Microphone Not Working**
```bash
# Ensure HTTPS is working:
- Custom domain has SSL certificate
- No mixed content warnings
- Permissions granted in browser
```

**📱 PWA Not Installing**
```bash
# Check PWA requirements:
- manifest.json loads correctly
- Service worker registers
- HTTPS enabled
- All icons present in /public/icons/
```

---

## 🎉 **Step 8: Success! Your PWA is Live**

### 🌐 **Live URLs:**
- **PWA**: https://voxinbox.kunalis.me (or https://kunalis.me/voxinbox)
- **Backend**: https://voxinbox-backend-production.railway.app
- **API Health**: https://voxinbox-backend-production.railway.app/

### 📊 **Features Enabled:**
- ✅ Voice-first email management
- ✅ Progressive Web App (installable)
- ✅ Real-time WebSocket communication
- ✅ Google OAuth authentication
- ✅ Offline functionality
- ✅ Custom domain with SSL
- ✅ Auto-deployment on git push

### 💰 **Cost Breakdown:**
- **Vercel**: Free (generous limits)
- **Railway**: Free tier → $5/month after usage
- **Domain**: Already owned
- **Total**: ~$5/month for production-grade hosting

---

## 🚀 **Bonus: Automatic Deployments**

Both platforms are now configured for automatic deployments:

```bash
# Deploy new changes
git add .
git commit -m "✨ Add new feature"
git push origin main

# Both Railway (backend) and Vercel (frontend) will auto-deploy!
```

## 📈 **Monitoring & Analytics**

### Railway Dashboard:
- View backend logs and metrics
- Monitor API usage and performance
- Scale resources if needed

### Vercel Dashboard:
- View frontend analytics
- Monitor Core Web Vitals
- Track PWA installation rates

---

## 🔧 **Local Development**

Keep your local environment working:

```bash
# Frontend
cd frontend
npm run dev

# Backend  
cd backend
python main.py

# Access local version at:
http://localhost:5173
```

---

**🎊 Congratulations! Your VoxInbox PWA is now live!**

Choose your preferred URL:
- **Subdomain**: `voxinbox.kunalis.me` (recommended)
- **Path-based**: `kunalis.me/voxinbox`

The app will work like a native mobile app when installed and provides a seamless voice-first email management experience.

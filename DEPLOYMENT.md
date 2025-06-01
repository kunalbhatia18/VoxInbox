# Deployment Guide for VoxInbox Monorepo

## 📁 Repository Structure
```
VoxInbox/
├── backend/          # FastAPI backend
├── frontend/         # React PWA frontend  
├── Dockerfile        # Backend container config
├── nixpacks.toml     # Railway build config
├── railway.json      # Railway deployment config
├── vercel.json       # Vercel deployment config
└── README.md         # This file
```

## 🚀 Deployment Steps

### Step 1: Push Updates to GitHub

```bash
# Navigate to your project root
cd /Users/kunal/voice-inbox-mvp

# Add all the new deployment configs
git add .
git commit -m "Add deployment configurations for Railway and Vercel"
git push origin main
```

### Step 2: Deploy Backend to Railway

1. **Go to [Railway.app](https://railway.app)**
2. **Sign up/Login** with GitHub
3. **Create New Project** → **Deploy from GitHub repo**
4. **Select** your `VoxInbox` repository
5. **Railway will auto-detect** Python and use nixpacks.toml

#### Environment Variables (Railway Dashboard):
```bash
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
SECRET_KEY=your_super_secret_jwt_key_here
FRONTEND_URL=https://vox-inbox.vercel.app
```

6. **Deploy** and note your Railway URL: `https://voxinbox-backend.railway.app`

### Step 3: Deploy Frontend to Vercel

1. **Go to [Vercel.com](https://vercel.com)**
2. **Sign up/Login** with GitHub  
3. **New Project** → **Import from GitHub**
4. **Select** your `VoxInbox` repository
5. **Vercel will auto-detect** the frontend config from vercel.json

#### Environment Variables (Vercel Dashboard):
```bash
VITE_API_BASE_URL=https://voxinbox-backend.railway.app
VITE_WS_BASE_URL=wss://voxinbox-backend.railway.app
VITE_ENV=production
```

6. **Deploy** and get your Vercel URL: `https://vox-inbox.vercel.app`

### Step 4: Update OAuth Settings

1. **Google Cloud Console** → **APIs & Services** → **Credentials**
2. **Edit your OAuth 2.0 Client ID**
3. **Add Authorized Redirect URIs:**
   ```
   https://voxinbox-backend.railway.app/api/callback
   ```
4. **Add Authorized Origins:**
   ```
   https://vox-inbox.vercel.app
   https://voxinbox-backend.railway.app
   ```

### Step 5: Update Frontend Environment Variable

Update your `.env.production` file with the actual Railway URL:

```bash
# frontend/.env.production
VITE_API_BASE_URL=https://voxinbox-backend.railway.app
VITE_WS_BASE_URL=wss://voxinbox-backend.railway.app
VITE_ENV=production
```

Then commit and push:
```bash
git add frontend/.env.production
git commit -m "Update production API URLs"
git push origin main
```

## 🔧 Troubleshooting

### Backend Issues:
- Check Railway logs for Python/FastAPI errors
- Verify environment variables are set
- Test `/health` endpoint

### Frontend Issues:  
- Check Vercel function logs
- Verify build outputs in `frontend/dist`
- Test PWA installation

### OAuth Issues:
- Verify redirect URIs match exactly
- Check CORS settings in backend
- Test login flow

## 📱 PWA Testing

1. **Visit your deployed frontend URL**
2. **On mobile:** Look for "Add to Home Screen"
3. **On desktop:** Look for install icon in address bar
4. **Test offline:** Turn off internet, app should still load
5. **Test voice:** Microphone permissions and WebSocket connection

## ✅ Success Criteria

- [ ] Backend deploys successfully on Railway
- [ ] Frontend deploys successfully on Vercel
- [ ] OAuth login works
- [ ] WebSocket connection established
- [ ] Voice commands processed
- [ ] PWA installable on mobile
- [ ] Offline functionality works

## 🎯 Final URLs

- **Frontend PWA:** https://vox-inbox.vercel.app
- **Backend API:** https://voxinbox-backend.railway.app
- **Health Check:** https://voxinbox-backend.railway.app/health

Your VoxInbox is now live as a fully functional PWA! 🎉

#!/bin/bash

# Create all necessary files with content

# Root level files
cat > README.md << 'EOF'
# Voice Inbox MVP

A mobile-friendly PWA for managing Gmail via text or voice commands.

## Quick Start

```bash
# Install dependencies
pnpm i

# Setup environment variables
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
# Fill in your API keys

# Start backend
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# In another terminal, start frontend
cd frontend && pnpm dev
```

## Tech Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS (PWA)
- **Backend**: Python 3.11 + FastAPI
- **APIs**: Gmail API, OpenAI (GPT-4o-mini, Whisper, TTS)

## Features

- 🎤 Voice input via OpenAI Whisper
- 💬 Natural language Gmail management
- 🔊 Text-to-speech responses
- 📱 Installable PWA for mobile
- 🔐 Secure Google OAuth2 authentication

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
```

### Backend (.env)
```
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
FRONTEND_URL=http://localhost:5173
SECRET_KEY=your-secret-key-here
```

## Development

Frontend runs on http://localhost:5173
Backend runs on http://localhost:8000
EOF

cat > .gitignore << 'EOF'
# Dependencies
node_modules/
__pycache__/
*.pyc
.pnpm-debug.log*

# Environment
.env
.env.local
.env.*.local

# Build outputs
dist/
build/
*.egg-info/

# IDE
.vscode/
.idea/
*.swp
*.swo
.DS_Store

# Python
venv/
.venv/
pip-log.txt
pip-delete-this-directory.txt

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Testing
coverage/
.pytest_cache/

# Misc
*.bak
.cache/
EOF

cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'frontend'
EOF

# Frontend files
cd frontend

cat > package.json << 'EOF'
{
  "name": "voice-inbox-frontend",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "format": "prettier --write 'src/**/*.{ts,tsx}'"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hot-toast": "^2.4.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.66",
    "@types/react-dom": "^18.2.22",
    "@typescript-eslint/eslint-plugin": "^7.2.0",
    "@typescript-eslint/parser": "^7.2.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.6",
    "postcss": "^8.4.38",
    "prettier": "^3.2.5",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.2.2",
    "vite": "^5.2.0",
    "vite-plugin-pwa": "^0.19.0"
  }
}
EOF

cat > vite.config.ts << 'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
      manifest: {
        name: 'VoiceInbox MVP',
        short_name: 'VoiceInbox',
        description: 'Manage Gmail with voice commands',
        theme_color: '#4285f4',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
EOF

cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

cat > tsconfig.node.json << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
EOF

cat > tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4285f4',
        secondary: '#34a853',
        danger: '#ea4335',
        warning: '#fbbc04',
      }
    },
  },
  plugins: [],
}
EOF

cat > postcss.config.js << 'EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

cat > index.html << 'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0" />
    <meta name="theme-color" content="#4285f4" />
    <meta name="description" content="Manage Gmail with voice commands" />
    <link rel="manifest" href="/manifest.json" />
    <title>VoiceInbox MVP</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

cat > .prettierrc << 'EOF'
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "none",
  "printWidth": 100
}
EOF

cat > .env.example << 'EOF'
VITE_API_URL=http://localhost:8000
EOF

# Create src files
cat > src/main.tsx << 'EOF'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF

cat > src/index.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-gray-50;
  }
}
EOF

cat > src/App.tsx << 'EOF'
import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Check authentication status
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include'
      })
      setIsAuthenticated(response.ok)
    } catch (error) {
      console.error('Auth check failed:', error)
    }
  }

  const handleLogin = () => {
    window.location.href = '/api/login'
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">VoiceInbox MVP</h1>
          <button
            onClick={handleLogin}
            className="bg-primary text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">VoiceInbox</h1>
          {/* Chat interface will go here */}
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-gray-600">Chat interface coming soon...</p>
          </div>
        </div>
      </div>
      <Toaster position="top-right" />
    </>
  )
}

export default App
EOF

cat > src/hooks/useSpeech.ts << 'EOF'
import { useState, useRef, useCallback } from 'react'

export const useSpeech = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await processAudio(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      setIsRecording(false)
    }
  }, [isRecording])

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true)
    try {
      // Will implement whisper API call here
      console.log('Processing audio...', audioBlob)
    } catch (error) {
      console.error('Failed to process audio:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  return {
    isRecording,
    isProcessing,
    startRecording,
    stopRecording
  }
}
EOF

# Create public files
cat > public/manifest.json << 'EOF'
{
  "name": "VoiceInbox MVP",
  "short_name": "VoiceInbox",
  "description": "Manage Gmail with voice commands",
  "theme_color": "#4285f4",
  "background_color": "#ffffff",
  "display": "standalone",
  "orientation": "portrait",
  "scope": "/",
  "start_url": "/",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "categories": ["productivity", "utilities"],
  "shortcuts": [
    {
      "name": "New Email",
      "url": "/?action=compose",
      "description": "Compose a new email"
    }
  ]
}
EOF

# Backend files
cd ../backend

cat > requirements.txt << 'EOF'
fastapi==0.110.0
uvicorn[standard]==0.27.1
python-dotenv==1.0.1
python-multipart==0.0.9
openai==1.12.0
google-auth==2.28.1
google-auth-oauthlib==1.2.0
google-auth-httplib2==0.2.0
google-api-python-client==2.118.0
httpx==0.27.0
python-jose[cryptography]==3.3.0
ruff==0.2.2
EOF

cat > .env.example << 'EOF'
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
FRONTEND_URL=http://localhost:5173
SECRET_KEY=your-secret-key-here
EOF

cat > ruff.toml << 'EOF'
# Ruff configuration
line-length = 100
target-version = "py311"

[lint]
select = ["E", "F", "I", "N", "W"]
ignore = ["E501"]  # Line too long

[format]
quote-style = "double"
indent-style = "space"
EOF

cat > main.py << 'EOF'
import os
import secrets
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import openai
from google.auth.transport import requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import httpx
import json
import io

# Load environment variables
load_dotenv()

# Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_urlsafe(32))
REDIRECT_URI = "http://localhost:8000/oauth2callback"

# Initialize OpenAI
openai.api_key = OPENAI_API_KEY

# Gmail scopes
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify"
]

# Initialize FastAPI
app = FastAPI(title="VoiceInbox MVP API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (for MVP)
sessions: Dict[str, Dict] = {}
chat_histories: Dict[str, List[Dict]] = {}

# Pydantic models
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class ChatResponse(BaseModel):
    reply: str
    actions: Optional[List[Dict]] = None

# Helper function to get current user
def get_current_user(request: Request) -> str:
    """Get current user from session cookie"""
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = sessions[session_id]
    if session.get("expires_at", 0) < datetime.now().timestamp():
        del sessions[session_id]
        raise HTTPException(status_code=401, detail="Session expired")
    
    return session["user_id"]

# Routes
@app.get("/")
async def root():
    return {"message": "VoiceInbox MVP API"}

@app.get("/auth/status")
async def auth_status(request: Request):
    """Check if user is authenticated"""
    try:
        user_id = get_current_user(request)
        return {"authenticated": True, "user_id": user_id}
    except HTTPException:
        return {"authenticated": False}

@app.get("/login")
async def login():
    """Initiate OAuth2 flow"""
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://accounts.google.com/o/oauth2/token",
                "redirect_uris": [REDIRECT_URI]
            }
        },
        scopes=SCOPES
    )
    flow.redirect_uri = REDIRECT_URI
    
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    
    # Store state in session for CSRF protection
    session_id = secrets.token_urlsafe(32)
    sessions[session_id] = {
        "state": state,
        "expires_at": (datetime.now() + timedelta(minutes=10)).timestamp()
    }
    
    response = RedirectResponse(url=authorization_url)
    response.set_cookie(key="session_id", value=session_id, httponly=True)
    return response

@app.get("/oauth2callback")
async def oauth2callback(request: Request, code: str, state: str):
    """Handle OAuth2 callback"""
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=400, detail="Invalid session")
    
    session = sessions[session_id]
    if session.get("state") != state:
        raise HTTPException(status_code=400, detail="Invalid state")
    
    # Exchange code for tokens
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://accounts.google.com/o/oauth2/token",
                "redirect_uris": [REDIRECT_URI]
            }
        },
        scopes=SCOPES,
        state=state
    )
    flow.redirect_uri = REDIRECT_URI
    flow.fetch_token(code=code)
    
    credentials = flow.credentials
    
    # Get user info
    service = build("oauth2", "v2", credentials=credentials)
    user_info = service.userinfo().get().execute()
    user_id = user_info["id"]
    
    # Store session
    sessions[session_id] = {
        "user_id": user_id,
        "email": user_info["email"],
        "access_token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "expires_at": (datetime.now() + timedelta(hours=1)).timestamp()
    }
    
    # Initialize chat history
    if user_id not in chat_histories:
        chat_histories[user_id] = []
    
    # Redirect to frontend
    response = RedirectResponse(url=FRONTEND_URL)
    return response

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user_id: str = Depends(get_current_user)):
    """Process chat messages"""
    # Get or create chat history
    if user_id not in chat_histories:
        chat_histories[user_id] = []
    
    # Add new messages to history
    for msg in request.messages:
        chat_histories[user_id].append(msg.dict())
    
    # Prepare messages for GPT
    system_prompt = """You are a helpful Gmail assistant. You have access to these functions:
    - listMail(query, maxResults): Search and list emails
    - sendMail(to, subject, body): Send an email
    - labelMail(messageId, label): Apply a label to an email
    - scheduleMeeting(): Schedule a meeting (stub)
    
    Analyze the user's request and decide which functions to call. Be concise in your responses."""
    
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(chat_histories[user_id][-10:])  # Last 10 messages for context
    
    try:
        # Call OpenAI
        response = await openai.ChatCompletion.acreate(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=500
        )
        
        assistant_message = response.choices[0].message.content
        
        # Add assistant response to history
        chat_histories[user_id].append({
            "role": "assistant",
            "content": assistant_message
        })
        
        # TODO: Parse function calls from response
        # For now, just return the text response
        return ChatResponse(reply=assistant_message, actions=None)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@app.post("/whisper")
async def whisper(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    """Convert audio to text using Whisper"""
    try:
        # Read audio file
        audio_data = await file.read()
        
        # Call Whisper API
        response = await openai.Audio.atranscribe(
            model="whisper-1",
            file=io.BytesIO(audio_data),
            response_format="text"
        )
        
        return {"transcript": response}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Whisper error: {str(e)}")

@app.post("/tts")
async def text_to_speech(text: str, user_id: str = Depends(get_current_user)):
    """Convert text to speech using OpenAI TTS"""
    try:
        response = await openai.Audio.create(
            model="tts-1",
            voice="nova",
            input=text
        )
        
        # Return audio stream
        return StreamingResponse(
            io.BytesIO(response.content),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=speech.mp3"
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")

# Gmail helper functions (stubs for now)
def get_gmail_service(user_id: str):
    """Get Gmail service for user"""
    session = next((s for s in sessions.values() if s.get("user_id") == user_id), None)
    if not session:
        raise HTTPException(status_code=401, detail="User not found")
    
    credentials = Credentials(
        token=session["access_token"],
        refresh_token=session.get("refresh_token"),
        token_uri="https://accounts.google.com/o/oauth2/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET
    )
    
    return build("gmail", "v1", credentials=credentials)

async def list_mail(user_id: str, query: str = "", max_results: int = 10):
    """List Gmail messages"""
    # TODO: Implement Gmail API call
    return {"messages": [], "query": query, "max_results": max_results}

async def send_mail(user_id: str, to: str, subject: str, body: str):
    """Send an email"""
    # TODO: Implement Gmail API call
    return {"status": "sent", "to": to, "subject": subject}

async def label_mail(user_id: str, message_id: str, label: str):
    """Apply label to email"""
    # TODO: Implement Gmail API call
    return {"status": "labeled", "message_id": message_id, "label": label}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
EOF

echo "✅ All files created successfully!"
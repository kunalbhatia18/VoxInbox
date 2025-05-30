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
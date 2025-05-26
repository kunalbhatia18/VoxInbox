#!/bin/bash

echo "🚀 VoiceInbox MVP Startup Script"
echo "================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this from the voice-inbox-mvp root directory"
    exit 1
fi

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "✅ Port $port is in use"
        return 0
    else
        echo "❌ Port $port is NOT in use"
        return 1
    fi
}

echo ""
echo "🔍 Checking current status..."

# Check backend port 8000
if check_port 8000; then
    echo "   Backend appears to be running"
else
    echo "   Backend is NOT running"
fi

# Check frontend port 5173
if check_port 5173; then
    echo "   Frontend appears to be running"
else
    echo "   Frontend is NOT running"
fi

echo ""
echo "🔧 Environment check..."

# Check if backend virtual environment exists
if [ -d "backend/venv" ]; then
    echo "✅ Backend virtual environment exists"
else
    echo "❌ Backend virtual environment missing"
    echo "   Run: cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
fi

# Check if node_modules exists
if [ -d "node_modules" ]; then
    echo "✅ Node modules installed"
else
    echo "❌ Node modules missing"
    echo "   Run: pnpm install"
fi

# Check if .env file exists
if [ -f "backend/.env" ]; then
    echo "✅ Backend .env file exists"
else
    echo "❌ Backend .env file missing"
    echo "   Copy backend/.env.example to backend/.env and fill in your credentials"
fi

echo ""
echo "🚀 Suggested startup commands:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd backend"
echo "  source venv/bin/activate"
echo "  uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd frontend"
echo "  npm run dev"
echo ""
echo "Then open: http://localhost:5173"
echo "And click 'Show Tests' to run connection diagnostics"

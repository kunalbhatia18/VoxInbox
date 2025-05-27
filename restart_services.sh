#!/bin/bash

echo "🔄 Restarting VoiceInbox Services..."
echo "====================================="

# Kill any existing processes
echo "🛑 Stopping existing processes..."
pkill -f "uvicorn main:app" || true
pkill -f "npm run dev" || true
sleep 2

echo "🧪 Testing fixes first..."
cd /Users/kunal/voice-inbox-mvp
python3 test_fixes.py

echo ""
echo "🚀 Starting Backend Server..."
cd /Users/kunal/voice-inbox-mvp/backend

# Start backend in background
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "⏳ Waiting for backend to start..."
sleep 3

echo "🌐 Starting Frontend..."
cd /Users/kunal/voice-inbox-mvp/frontend
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Services started!"
echo "🖥️  Frontend: http://localhost:5173"
echo "🔧 Backend: http://localhost:8000"
echo ""
echo "📋 To stop services:"
echo "kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "🎤 Test Instructions:"
echo "1. Go to http://localhost:5173"
echo "2. Login with Google"
echo "3. Hold the blue button and say 'Hello'"
echo "4. Release button and wait for purple button + AI voice"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for user interrupt
wait

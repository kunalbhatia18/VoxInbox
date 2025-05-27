#!/bin/bash

echo "🔄 Restarting VoiceInbox with Voice Fixes..."
echo "============================================="

# Kill any existing processes
echo "🛑 Stopping existing processes..."
pkill -f "uvicorn main:app" || true
pkill -f "python main.py" || true  
pkill -f "npm run dev" || true
pkill -f "vite" || true
sleep 3

echo "🧪 Testing voice fixes..."
cd /Users/kunal/voice-inbox-mvp
python3 test_voice_fixes.py

echo ""
echo "🚀 Starting Services..."

# Start backend
echo "📡 Starting Backend..."
cd /Users/kunal/voice-inbox-mvp/backend
python3 main.py &
BACKEND_PID=$!

echo "⏳ Waiting for backend to initialize..."
sleep 4

# Check if backend started successfully
if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend running (PID: $BACKEND_PID)"
else
    echo "❌ Backend failed to start"
    exit 1
fi

# Start frontend  
echo "🌐 Starting Frontend..."
cd /Users/kunal/voice-inbox-mvp/frontend
npm run dev &
FRONTEND_PID=$!

echo "⏳ Waiting for frontend to start..."  
sleep 3

echo ""
echo "✅ Services Started!"
echo "🖥️  Frontend: http://localhost:5173"
echo "🔧 Backend: http://localhost:8000"
echo ""
echo "🎯 FIXES APPLIED:"
echo "✅ AudioContext user gesture handling"
echo "✅ Direct PCM16 audio capture"  
echo "✅ Fixed Python boolean serialization"
echo "✅ Simplified voice processing pipeline"
echo ""
echo "🧪 TEST INSTRUCTIONS:"
echo "1. Go to http://localhost:5173"
echo "2. Login with Google (wait for green dot)"  
echo "3. HOLD blue button and say 'Hello VoiceInbox'"
echo "4. RELEASE button"
echo "5. EXPECTED: Purple button + AI voice response"
echo ""
echo "🔍 WATCH CONSOLE FOR:"
echo "✅ '🎤 Processed [X] audio samples' (not 0)"
echo "✅ '📨 Raw OpenAI message: response.audio.delta'"
echo "✅ '🎧 Audio delta received: [X] chars' (not 0)"  
echo "✅ '🔊 AI started speaking'"
echo ""
echo "❌ Should NOT see:"
echo "• 'buffer too small' errors"
echo "• 'name false is not defined'"
echo "• 'AudioContext was not allowed to start'"
echo ""
echo "📋 Process IDs:"
echo "kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo "👋 Services stopped"
    exit 0
}

# Set trap for cleanup
trap cleanup SIGINT SIGTERM

# Wait for user interrupt
wait

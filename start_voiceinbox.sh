#!/bin/bash

echo "🔄 Testing and Restarting VoiceInbox..."
echo "====================================="

# Navigate to project root
cd /Users/kunal/voice-inbox-mvp

# Test the fixes first
echo "🧪 Testing fixes in backend..."
cd backend
python3 test_quick.py

if [ $? -ne 0 ]; then
    echo "❌ Tests failed! Please fix issues before starting."
    exit 1
fi

echo ""
echo "✅ Tests passed! Starting services..."
echo ""

# Kill existing processes
echo "🛑 Stopping any existing processes..."
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

# Start backend
echo "🚀 Starting backend server..."
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Start frontend in new terminal window
echo "🌐 Starting frontend..."
cd ../frontend

# Check if we're on macOS and can open new terminal
if command -v osascript &> /dev/null; then
    osascript -e 'tell application "Terminal" to do script "cd /Users/kunal/voice-inbox-mvp/frontend && npm run dev"'
    echo "✅ Frontend started in new terminal window"
else
    # Fallback - start in background
    npm run dev &
    FRONTEND_PID=$!
    echo "✅ Frontend started in background (PID: $FRONTEND_PID)"
fi

echo ""
echo "🎉 VoiceInbox is starting up!"
echo "🖥️  Frontend: http://localhost:5173"
echo "🔧 Backend: http://localhost:8000"
echo ""
echo "🎤 Test Instructions:"
echo "1. Go to http://localhost:5173"
echo "2. Login with Google (wait for green dot)"
echo "3. Hold blue button and say: 'Hello, can you hear me?'"
echo "4. Release button and wait for purple button + AI voice"
echo ""
echo "📊 Watch console for these messages:"
echo "   - 🚀 OpenAI response started"
echo "   - 🎧 Audio delta received"
echo "   - 🔊 AI started speaking"
echo ""
echo "Press Ctrl+C to stop backend server"

# Wait for backend (frontend runs in separate terminal)
wait $BACKEND_PID 2>/dev/null

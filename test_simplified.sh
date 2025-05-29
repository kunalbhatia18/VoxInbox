#!/bin/bash

echo "🧪 Testing VoiceInbox with Simplified OpenAI Integration"
echo "======================================================"

cd /Users/kunal/voice-inbox-mvp/backend

echo "🛑 Stopping any existing backend processes..."
pkill -f "uvicorn main:app" 2>/dev/null || true
sleep 2

echo "🚀 Starting backend with simplified OpenAI integration..."
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo ""
echo "✅ Backend started with PID: $BACKEND_PID"
echo "🔧 Using simplified OpenAI proxy (no Gmail functions)"
echo ""
echo "🧪 Now test voice interaction:"
echo "1. Go to http://localhost:5173"
echo "2. Login with Google"
echo "3. Say: 'Hello, can you hear me?'"
echo "4. Check if button turns purple and audio plays"
echo ""
echo "Expected behavior:"
echo "- Button: Blue → Red → Purple → Blue"
echo "- Audio should play from OpenAI"
echo "- No stuck purple button"
echo ""
echo "Press Ctrl+C to stop"

# Wait for backend
wait $BACKEND_PID 2>/dev/null

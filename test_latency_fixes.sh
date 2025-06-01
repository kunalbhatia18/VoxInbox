#!/bin/bash

echo "🚀 TESTING LATENCY FIXES - VoiceInbox Optimized"
echo "=================================================="

# Navigate to project root
cd /Users/kunal/voice-inbox-mvp

# Kill existing processes
echo "🛑 Stopping any existing processes..."
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

echo "✅ CRITICAL FIXES APPLIED:"
echo "   🔧 Temperature: Fixed 0.1 -> 0.6 (meets OpenAI requirement)"
echo "   🎯 VAD Settings: Optimized for 0.6 threshold, 300ms padding, 400ms silence"
echo "   🚫 Race Conditions: Removed auto-response conflicts"
echo "   ⏱️ Request Blocking: Added 1s debounce + processing state"
echo ""

# Start backend
echo "🚀 Starting OPTIMIZED backend server..."
cd backend
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
echo "🎯 EXPECTED IMPROVEMENTS:"
echo "   ⚡ Latency: Should be <250ms (was 3-4 seconds)"
echo "   🚫 No more temperature errors"
echo "   🔄 No more race condition errors"
echo "   ⏳ 1-second debounce prevents rapid-fire requests"
echo ""
echo "🧪 TESTING PROCEDURE:"
echo "1. Go to http://localhost:5173"
echo "2. Login with Google (wait for green dot)"
echo "3. Hold blue button, say: 'How many unread emails do I have?'"
echo "4. Release button immediately - don't speak again until response"
echo "5. Watch for purple button + AI voice response"
echo ""
echo "📊 SUCCESS INDICATORS TO WATCH FOR:"
echo "   ✅ '⚡ TOTAL RESPONSE LATENCY: XXXms' - should be <250ms"
echo "   ✅ '🎤 Response created with session defaults (no conflicts)'"
echo "   ✅ '📱 Audio committed - waiting for VAD to trigger response'"
echo "   ✅ No temperature or race condition errors"
echo "   ✅ 'Request processing complete - ready for new requests'"
echo ""
echo "🚨 IF ISSUES PERSIST:"
echo "   - Check backend logs for latency measurements"
echo "   - Ensure 1-second gap between voice commands"
echo "   - Look for yellow spinner (processing state active)"
echo ""
echo "Press Ctrl+C to stop backend server"

# Wait for backend (frontend runs in separate terminal)
wait $BACKEND_PID 2>/dev/null

#!/bin/bash

echo "🚨 EMERGENCY LATENCY FIXES - VoiceInbox Crisis Mode"
echo "===================================================="

# Navigate to project root
cd /Users/kunal/voice-inbox-mvp

# Kill existing processes
echo "🛑 Stopping any existing processes..."
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 3

echo "🔧 EMERGENCY FIXES APPLIED:"
echo "   ⚡ VAD Settings: Optimized 0.5 threshold, 600ms silence"
echo "   🛡️ Audio Buffers: Increased minimum size to 2000 chars"
echo "   ⏰ Debounce: Increased to 2 seconds between requests"
echo "   🚨 Emergency Timeout: 10-second automatic reset"
echo "   🔄 Error Recovery: Comprehensive state resets"
echo ""

echo "🎯 TARGETING ISSUES:"
echo "   ❌ 56-102 second latencies → Target: <10 seconds"
echo "   ❌ Empty audio buffer errors → Prevention"
echo "   ❌ Race condition errors → Timeout protection"
echo "   ❌ Stuck yellow button → Emergency resets"
echo ""

# Start backend
echo "🚀 Starting CRISIS-MODE backend server..."
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 6

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
echo "🧪 CRITICAL TEST PROCEDURE:"
echo "1. Go to http://localhost:5173"
echo "2. Login with Google (wait for green dot)"
echo "3. Hold blue button for 2+ seconds, say: 'How many unread emails?'"
echo "4. Release button and WAIT - don't speak again until complete"
echo "5. Watch for response within 10 seconds (not 60+ seconds!)"
echo ""
echo "📊 SUCCESS INDICATORS:"
echo "   ✅ Response latency <10 seconds (was 56-102s)"
echo "   ✅ No 'buffer too small' errors"
echo "   ✅ No 'conversation already has active response' errors"
echo "   ✅ Button: Blue → Yellow → Purple → Blue (cycles properly)"
echo "   ✅ Emergency timeout after 10s if stuck"
echo ""
echo "🚨 IF STILL BROKEN:"
echo "   - Look for 'EMERGENCY TIMEOUT' messages"
echo "   - Check for improved latency (should be <10s now)"
echo "   - Try 2-second gaps between voice commands"
echo ""
echo "Press Ctrl+C to stop backend server"

# Wait for backend (frontend runs in separate terminal)
wait $BACKEND_PID 2>/dev/null

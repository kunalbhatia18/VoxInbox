#!/bin/bash

echo "🎯 TESTING FINAL LATENCY & STATIC FIXES - VoiceInbox Optimized"
echo "================================================================"

# Navigate to project root
cd /Users/kunal/voice-inbox-mvp

# Kill existing processes
echo "🛑 Stopping any existing processes..."
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

echo "✅ FINAL CRITICAL FIXES APPLIED:"
echo "   🔧 VAD Settings: threshold=0.8, padding=500ms, silence=1000ms (much less aggressive)"
echo "   🎵 Voice Model: 'shimmer' instead of 'alloy' (potentially clearer)"
echo "   🤖 Model: gpt-4o-realtime-preview (FULL model vs mini for better audio quality)"
echo "   🚫 Race Conditions: Removed double response creation after commit"
echo "   ⏰ Emergency Timeout: 10s timeout to prevent stuck states"
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
echo "   ⚡ Latency: Should be <250ms (was 3000+ms)"
echo "   🎵 Audio Quality: Clearer with 'shimmer' voice and full gpt-4o model"
echo "   📞 No more static/artifacts from audio compression"
echo "   🗣️ Longer speech detection (1000ms silence) - no early cutoffs"
echo "   🚫 No more race condition errors"
echo ""
echo "🧪 TESTING PROCEDURE:"
echo "1. Go to http://localhost:5173"
echo "2. Login with Google (wait for green dot)"
echo "3. Hold blue button, say: 'How many unread emails do I have?' (speak clearly and naturally)"
echo "4. Release button and wait for shimmer voice response"
echo "5. Wait for FULL response before trying again"
echo ""
echo "📊 SUCCESS INDICATORS TO WATCH FOR:"
echo "   ✅ '⚡ TOTAL LATENCY: XXXms' - should be <250ms"
echo "   ✅ '📱 Audio committed - waiting for VAD to trigger response naturally'"
echo "   ✅ 'Connected to OpenAI Realtime API (gpt-4o-realtime-preview) - FULL MODEL'"
echo "   ✅ No temperature or race condition errors"
echo "   ✅ Clear, non-static audio response"
echo "   ✅ Longer speech duration before VAD cutoff (>500ms)"
echo ""
echo "🎵 AUDIO QUALITY TEST:"
echo "   - Should sound clearer and more natural"
echo "   - No static, crackling, or compression artifacts"
echo "   - Shimmer voice should be more pleasant than alloy"
echo ""
echo "🚨 IF ISSUES PERSIST:"
echo "   - Check backend logs for latency measurements"
echo "   - Ensure 1-second gap between voice commands"
echo "   - Listen carefully for audio quality improvements"
echo "   - Note if VAD allows longer speech (1000ms silence)"
echo ""
echo "Press Ctrl+C to stop backend server"

# Wait for backend (frontend runs in separate terminal)
wait $BACKEND_PID 2>/dev/null

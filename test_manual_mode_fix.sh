#!/bin/bash

echo "🎯 TESTING MANUAL MODE FIX - No More VAD Interference!"
echo "======================================================"

# Navigate to project root
cd /Users/kunal/voice-inbox-mvp

# Kill existing processes
echo "🛑 Stopping any existing processes..."
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

echo "✅ CRITICAL MANUAL MODE FIXES APPLIED:"
echo "   🚫 VAD COMPLETELY DISABLED: turn_detection: 'none'"
echo "   ⚡ IMMEDIATE RESPONSE: No waiting for VAD in manual mode"
echo "   🎤 USER CONTROLS RECORDING: Push-to-talk works as intended"
echo "   🤖 FULL GPT-4o MODEL: Better audio quality"
echo "   🎵 SHIMMER VOICE: Clearer audio output"
echo ""

# Start backend
echo "🚀 Starting FIXED backend server..."
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
echo "   🚫 NO MORE VAD CUTOFFS: You control when recording stops"
echo "   ⚡ INSTANT RESPONSES: No waiting for voice activity detection"
echo "   🎤 FULL SPEECH CAPTURE: Record as long as you hold the button"
echo "   🤖 CLEAR AUDIO: Shimmer voice with full GPT-4o model"
echo ""
echo "🧪 TESTING PROCEDURE:"
echo "1. Go to http://localhost:5173"
echo "2. Login with Google (wait for green dot)"
echo "3. **HOLD BUTTON** and say: 'How many unread emails do I have?'"
echo "4. **KEEP HOLDING** until you finish speaking"
echo "5. **THEN RELEASE** - recording stops when YOU release, not VAD"
echo "6. Wait for immediate shimmer voice response"
echo ""
echo "📊 SUCCESS INDICATORS TO WATCH FOR:"
echo "   ✅ '📱 Audio committed - creating response IMMEDIATELY (manual mode)'"
echo "   ✅ '🤖 Response created immediately (no VAD delay)'"
echo "   ✅ 'Connected to OpenAI Realtime API (gpt-4o-realtime-preview)'"
echo "   ✅ NO MORE '⏱️ User spoke for XXXms before VAD cutoff'"
echo "   ✅ You control recording duration completely"
echo ""
echo "🎤 MANUAL MODE BEHAVIOR:"
echo "   - Press and HOLD button to start recording"
echo "   - Speak naturally for as long as needed"
echo "   - Release button to stop recording and send"
echo "   - NO voice activity detection interference"
echo "   - Immediate response creation and audio playback"
echo ""
echo "🚨 IF IT STILL CUTS OFF:"
echo "   - Make sure you're holding the button the entire time"
echo "   - Check for 'VAD cutoff' messages (should be GONE)"
echo "   - Verify immediate response creation in logs"
echo ""
echo "Press Ctrl+C to stop backend server"

# Wait for backend (frontend runs in separate terminal)
wait $BACKEND_PID 2>/dev/null

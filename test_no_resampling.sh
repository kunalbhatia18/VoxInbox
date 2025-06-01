#!/bin/bash

echo "⚡ NO RESAMPLING TEST - VoiceInbox Audio Optimization"
echo "===================================================="

# Navigate to project root
cd /Users/kunal/voice-inbox-mvp

# Kill existing processes
echo "🛑 Stopping any existing processes..."
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 3

echo "🎯 RESAMPLING ELIMINATION FIXES:"
echo "   ✅ Voice Capture: 48kHz → 24kHz (eliminated resampling)"
echo "   ✅ Audio Playback: 24kHz → 24kHz (already perfect)"
echo "   ✅ Continuous Voice: 48kHz → 24kHz (eliminated resampling)"
echo "   🚀 Expected: NO RESAMPLING on input OR output side!"
echo ""

# Start backend
echo "🚀 Starting backend server..."
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
echo "🧪 CRITICAL RESAMPLING TEST:"
echo "1. Go to http://localhost:5173"
echo "2. Login with Google (wait for green dot)"
echo "3. Hold blue button, say: 'How many unread emails?'"
echo "4. Release button and watch console logs"
echo ""
echo "📊 LOGS TO WATCH FOR:"
echo "   ✅ '🎵 Perfect match! No resampling: XXXX samples at 24000Hz' (OUTPUT)"
echo "   ✅ '🎤 Voice resampled: 24000Hz → 24kHz for OpenAI' (INPUT)"
echo "   🚫 Should NOT see: '🎤 Voice resampled: 48000Hz → 24kHz'"
echo "   🚫 Should NOT see any 48kHz to 24kHz conversion messages"
echo ""
echo "🎯 SUCCESS CRITERIA:"
echo "   ✅ NO resampling on input side (24kHz → 24kHz)"
echo "   ✅ NO resampling on output side (24kHz → 24kHz)"
echo "   ⚡ Potentially faster audio processing (less CPU)"
echo "   🔊 Same perfect audio quality"
echo ""
echo "💡 BENEFIT:"
echo "   - Eliminated unnecessary CPU-intensive resampling"
echo "   - Direct 24kHz → 24kHz path for optimal performance"
echo "   - Reduced latency from eliminating resampling step"
echo ""
echo "Press Ctrl+C to stop backend server"

# Wait for backend (frontend runs in separate terminal)
wait $BACKEND_PID 2>/dev/null

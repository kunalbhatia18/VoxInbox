#!/bin/bash

echo "🚀 Restarting VoiceInbox with Latency Optimizations..."
echo "=========================================="

# Navigate to project root
cd /Users/kunal/voice-inbox-mvp

# Kill existing processes
echo "🛑 Stopping existing services..."
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

echo ""
echo "✅ Applied these CRITICAL latency fixes:"
echo "   🚫 Block multiple requests during processing"
echo "   ⚡ Ultra-fast VAD: 0.4 threshold, 50ms padding, 150ms silence"
echo "   🎯 Clear visual feedback (yellow spinning = processing)"
echo "   📊 Real-time latency measurement logging"
echo "   🏃 Immediate audio-only response creation"
echo "   ⏰ 3-second timeout for faster recovery"
echo ""

# Start backend
echo "🚀 Starting optimized backend..."
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Start frontend in new terminal
echo "🌐 Starting optimized frontend..."
cd ../frontend

if command -v osascript &> /dev/null; then
    osascript -e 'tell application "Terminal" to do script "cd /Users/kunal/voice-inbox-mvp/frontend && npm run dev"'
    echo "✅ Frontend started in new terminal window"
else
    npm run dev &
    FRONTEND_PID=$!
    echo "✅ Frontend started in background (PID: $FRONTEND_PID)"
fi

echo ""
echo "🎯 TESTING INSTRUCTIONS:"
echo "================================"
echo "1. Go to http://localhost:5173"
echo "2. Login and wait for green connection dot"
echo "3. Hold button and say something SHORT (2-3 words)"
echo "4. Watch for these NEW optimizations:"
echo ""
echo "🟡 YELLOW SPINNING BUTTON = Processing (prevents double requests)"
echo "⚡ Console: 'TOTAL RESPONSE LATENCY: XXXms' (should be <250ms)"
echo "🚫 'Processing previous request...' toast if you try to speak too soon"
echo "✅ Much faster response times!"
echo ""
echo "📊 EXPECTED IMPROVEMENTS:"
echo "   • Latency: 3-4 seconds → <250ms target"
echo "   • No more duplicate requests"
echo "   • Clear visual feedback"
echo "   • Auto-recovery from stuck states"
echo ""
echo "Press Ctrl+C to stop backend server"

# Wait for backend
wait $BACKEND_PID 2>/dev/null

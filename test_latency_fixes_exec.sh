#!/bin/bash
# Make script executable

echo "🚀 Testing VoiceInbox Latency Fixes"
echo "=================================="
echo ""
echo "🎯 FIXES APPLIED:"
echo "✅ Concurrent request prevention (no overlapping voice commands)"
echo "✅ Processing state management (visual feedback when busy)"
echo "✅ Ultra-fast VAD settings (150ms silence detection)"
echo "✅ 20-token response limit (lightning-fast AI replies)"
echo "✅ Immediate response creation after function calls"
echo "✅ Enhanced error recovery and timeouts"
echo ""

# Navigate to project root
cd /Users/kunal/voice-inbox-mvp

# Kill existing processes
echo "🛑 Stopping existing services..."
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

# Start backend
echo "🚀 Starting optimized backend..."
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Start frontend in new terminal
echo "🌐 Starting frontend..."
cd ../frontend

# Check if we're on macOS and can open new terminal
if command -v osascript &> /dev/null; then
    osascript -e 'tell application "Terminal" to do script "cd /Users/kunal/voice-inbox-mvp/frontend && npm run dev"'
    echo "✅ Frontend started in new terminal window"
else
    npm run dev &
    FRONTEND_PID=$!
    echo "✅ Frontend started in background"
fi

echo ""
echo "🎯 LATENCY TESTING INSTRUCTIONS:"
echo "================================"
echo ""
echo "1. 🌐 Go to: http://localhost:5173"
echo "2. 🔐 Login with Google (wait for green connection dot)"
echo "3. 🎤 Use Push-to-Talk mode (recommended for testing)"
echo ""
echo "🧪 TEST SCENARIOS:"
echo ""
echo "Test 1 - Basic Count (should be <1 second total):"
echo '   Say: "How many unread emails do I have?"'
echo '   Expected: Yellow spinning button → Purple speaking → Blue ready (fast!)'
echo ""
echo "Test 2 - Quick List (should be <2 seconds total):"
echo '   Say: "List my recent emails"'
echo '   Expected: Ultra-brief AI response (20 tokens max)'
echo ""
echo "Test 3 - Concurrent Prevention:"
echo '   Try speaking twice quickly in a row'
echo '   Expected: Second attempt blocked with "Still processing" message'
echo ""
echo "📊 MONITOR THESE LOGS:"
echo "====================="
echo ""
echo "✅ Good signs to look for:"
echo '   - "⚡ ULTRA-SPEED: Immediate 20-token response created"'
echo '   - "⚡ TOTAL LATENCY: XXXms (target: <250ms)"'
echo '   - "⚡ COMMIT TO RESPONSE: XXXms (faster = better)"'
echo '   - "✓ Full response cycle complete - ready for new requests"'
echo ""
echo "❌ Bad signs (should be fixed now):"
echo '   - Multiple "response.created" messages in a row'
echo '   - "conversation_already_has_active_response" errors'
echo '   - "input_audio_buffer_commit_empty" errors'
echo '   - Status: "cancelled" responses'
echo ""
echo "🎯 SUCCESS CRITERIA:"
echo "==================="
echo ""
echo "✅ Total response time: <1 second for simple queries"
echo "✅ No overlapping requests (concurrent prevention working)"
echo "✅ Clear visual feedback (yellow → purple → blue states)"
echo "✅ No error messages in console"
echo "✅ Ultra-brief AI responses (1 sentence only)"
echo ""
echo "Press Ctrl+C to stop backend when done testing"
echo ""

# Wait for backend
wait $BACKEND_PID 2>/dev/null

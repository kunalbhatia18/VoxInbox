#!/bin/bash

echo "🔧 Testing Critical Fixes for VoiceInbox"
echo "========================================"
echo ""
echo "🎯 CRITICAL FIXES APPLIED:"
echo "✅ Fixed OpenAI modalities error (audio-only → audio+text)"
echo "✅ Reduced tokens even further (20 → 15 tokens max)"
echo "✅ Ultra-aggressive VAD (100ms silence, 0.3 threshold)"
echo "✅ Maximum consistency (temperature 0.1)"
echo "✅ Concurrent request prevention (working!)"
echo ""

# Navigate to project root
cd /Users/kunal/voice-inbox-mvp

# Kill existing processes
echo "🛑 Stopping existing services..."
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

# Start backend
echo "🚀 Starting ultra-optimized backend..."
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
echo "🎯 CRITICAL TEST SCENARIOS:"
echo "==========================="
echo ""
echo "🧪 Test 1 - Simple Count (target: <500ms total):"
echo '   Say: "How many unread emails?"'
echo '   Expected: Much faster than 1.3s, no API errors'
echo ""
echo "🧪 Test 2 - Concurrent Prevention (should work perfectly):"
echo '   Speak twice quickly in succession'
echo '   Expected: Second blocked with "Still processing" message'
echo ""
echo "🧪 Test 3 - Ultra-Brief Responses:"
echo '   Any email query'
echo '   Expected: Extremely short AI responses (15 tokens max)'
echo ""
echo "📊 MONITOR THESE KEY METRICS:"
echo "============================"
echo ""
echo "✅ SHOULD SEE (fixed issues):"
echo '   - "⚡ ULTRA-SPEED: Immediate 15-token response created"'
echo '   - "⚡ TOTAL RESPONSE LATENCY: XXXms" (should be <500ms now)'
echo '   - "✅ Request processing complete - ready for new requests"'
echo '   - NO "Invalid modalities" errors'
echo '   - NO "status: cancelled" responses'
echo ""
echo "❌ SHOULD NOT SEE (these were the problems):"
echo '   - "Invalid modalities: ['"'"'audio'"'"']" errors'
echo '   - Multiple cancelled responses in a row'
echo '   - Latency >1000ms consistently'
echo ""
echo "🎯 SUCCESS TARGETS:"
echo "=================="
echo ""
echo "🚀 Latency: <500ms total (down from 1320ms)"
echo "🚀 No API errors (modalities fix)"
echo "🚀 Consistent responses (no cancellations)"
echo "🚀 Ultra-brief AI replies (15 tokens)"
echo "🚀 Perfect concurrent prevention"
echo ""
echo "💡 NOTE: The 1.3s → <500ms improvement depends on:"
echo "   - Ultra-aggressive VAD settings (100ms silence)"
echo "   - Minimal tokens (15 vs 20)"
echo "   - Consistent temperature (0.1)"  
echo "   - Fixed API errors (no retries needed)"
echo ""
echo "🔧 If latency is still >500ms, the bottleneck is likely:"
echo "   - Network latency to OpenAI servers"
echo "   - OpenAI processing time (inherent)"
echo "   - Gmail API response time (for function calls)"
echo ""
echo "Press Ctrl+C to stop backend when done testing"
echo "Test for significant improvement over the 1320ms baseline!"
echo ""

# Wait for backend
wait $BACKEND_PID 2>/dev/null

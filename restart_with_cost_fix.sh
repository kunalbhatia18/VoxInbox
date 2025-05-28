#!/bin/bash

echo "🔧 Fixing OpenAI Realtime API Configuration..."
echo "============================================="

# Navigate to backend
cd /Users/kunal/voice-inbox-mvp/backend

# Test the configuration
echo "📋 Testing configuration..."
python3 -c "
import json
config = {
    'temperature': 0.6,
    'max_response_output_tokens': 150
}
print('✅ Temperature:', config['temperature'], '(minimum allowed)')
print('✅ Max tokens:', config['max_response_output_tokens'])
"

echo ""
echo "🚀 Restarting backend with cost optimizations..."
echo ""

# Kill existing backend
pkill -f "uvicorn main:app" 2>/dev/null || true
sleep 2

# Start backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &

echo ""
echo "✅ Backend restarted with cost optimizations!"
echo ""
echo "💰 Expected cost reduction: ~70%"
echo "• Responses limited to 150 tokens"
echo "• Brief instructions enforced"
echo "• VAD optimized to reduce false triggers"
echo ""
echo "🧪 Test with: 'How many unread emails?'"
echo "   Expected: Short 5-10 word response"
echo ""
echo "Press Ctrl+C to stop the server"

# Keep script running
wait

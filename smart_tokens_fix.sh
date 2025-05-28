#!/bin/bash

echo "🎯 Applying Smart Token Limits Fix"
echo "=================================="

cd /Users/kunal/voice-inbox-mvp

echo ""
echo "✅ Smart Token Limits Applied:"
echo "• Short queries (count): 100 tokens"
echo "• Medium queries (list): 300 tokens"
echo "• Long queries (summaries): 800 tokens"
echo "• Default: 200 tokens"
echo ""
echo "No more cut-off summaries! 🎉"
echo ""

# Kill existing backend
pkill -f "uvicorn main:app" 2>/dev/null || true
sleep 2

# Start backend
echo "🚀 Starting backend with smart token limits..."
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &

echo ""
echo "✅ Backend running with smart token limits!"
echo ""
echo "🧪 Test it:"
echo "1. 'How many unread emails?' → Quick response (100 tokens)"
echo "2. 'List my unread emails' → Detailed list (300 tokens)"
echo "3. 'Summarize the email from John' → Full summary (800 tokens)"
echo ""
echo "📊 Console will show: '💬 Using XXX token limit for function_name'"
echo ""
echo "Press Ctrl+C to stop"

wait

#!/bin/bash

echo "🧪 Testing OpenAI Realtime Proxy Setup"
echo "====================================="

cd /Users/kunal/voice-inbox-mvp

# Activate virtual environment  
source backend/venv/bin/activate

echo "🔍 Testing proxy integration..."
python3 test_proxy_setup.py

echo ""
echo "🎯 If you see '🎉 Proxy setup test PASSED!' above,"
echo "   then we're ready to integrate with your main WebSocket!"
echo ""
echo "This test verifies:"
echo "✅ Proxy can connect to OpenAI Realtime API"  
echo "✅ Session configured with Gmail tools"
echo "✅ Tool definitions are properly formatted"

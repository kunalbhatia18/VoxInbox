#!/bin/bash

echo "🧪 Testing OpenAI Realtime API Connection"
echo "========================================"

cd /Users/kunal/voice-inbox-mvp/backend

# Activate virtual environment
source venv/bin/activate

echo "🔍 Checking environment variables..."
if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ OPENAI_API_KEY not found in environment"
    echo "   Loading from .env file..."
    export $(cat .env | grep OPENAI_API_KEY | xargs)
    if [ -z "$OPENAI_API_KEY" ]; then
        echo "❌ OPENAI_API_KEY not found in .env file either"
        exit 1
    fi
fi

echo "✅ OPENAI_API_KEY found (length: ${#OPENAI_API_KEY})"

echo ""
echo "🚀 Testing OpenAI Realtime API connection..."
python3 openai_realtime.py

echo ""
echo "🎯 If you see '✅ OpenAI Realtime API test successful!' above,"
echo "   then we're ready for the next step!"
echo ""
echo "If you see errors, we'll debug them before proceeding."

#!/bin/bash

echo "🔧 VoiceInbox Debug Script"
echo "=========================="

echo ""
echo "🎯 Issue Analysis:"
echo "1. ✅ AudioWorklet loads successfully first time"
echo "2. ❌ OpenAI returns response.created + response.done but NO response.audio.delta"
echo "3. ❌ Second recording fails: 'AudioWorklet does not have a valid AudioWorkletGlobalScope'"
echo ""

echo "🔍 Checking AudioWorklet files..."
if [ -f "frontend/public/worklets/voice-processor.js" ]; then
    echo "✅ voice-processor.js exists"
else
    echo "❌ voice-processor.js missing!"
    exit 1
fi

if [ -f "frontend/public/worklets/continuous-voice-processor.js" ]; then
    echo "✅ continuous-voice-processor.js exists"
else
    echo "❌ continuous-voice-processor.js missing!"
    exit 1
fi

echo ""
echo "🎙️ Testing AudioWorklet syntax..."
node -c frontend/public/worklets/voice-processor.js 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ voice-processor.js syntax OK"
else
    echo "❌ voice-processor.js syntax error!"
fi

node -c frontend/public/worklets/continuous-voice-processor.js 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ continuous-voice-processor.js syntax OK"
else
    echo "❌ continuous-voice-processor.js syntax error!"
fi

echo ""
echo "🚀 Applied Fixes:"
echo "✅ 1. Fixed AudioWorklet scope by creating fresh AudioContext each time"
echo "✅ 2. Added stronger audio-first instructions to OpenAI"
echo "✅ 3. Reduced max_output_tokens (200) to increase audio likelihood"
echo "✅ 4. Added detailed response debugging in backend"
echo "✅ 5. Enhanced user messaging for text-only responses"
echo ""

echo "🧪 Testing Instructions:"
echo "1. Start backend: cd backend && python main.py"
echo "2. Start frontend: cd frontend && npm run dev" 
echo "3. Login and try voice recording"
echo "4. Check console for debugging output:"
echo "   - Look for '🎙️ Response done. Output items: X'"
echo "   - Check if 'Audio found!' appears"
echo "   - If only text content, OpenAI is not generating audio"
echo ""

echo "💡 Troubleshooting Tips:"
echo "- Try simpler questions like 'Hello' or 'How many emails?'"
echo "- Shorter questions are more likely to get audio responses"
echo "- Check that microphone permission is granted"
echo "- Refresh page between tests to reset AudioContext"
echo ""

echo "🔧 Debug Commands:"
echo "Backend logs: tail -f backend/logs (if logging to file)"
echo "Frontend console: Open DevTools in browser"
echo "Network tab: Check WebSocket messages"

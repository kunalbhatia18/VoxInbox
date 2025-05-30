#!/bin/bash

# Test script to verify all fixes are working correctly
# Run this after implementing all the fixes

echo "🧪 Testing VoiceInbox MVP Fixes"
echo "================================"

# Test 1: Check if AudioWorklet files exist
echo "✅ Testing AudioWorklet Migration (Issue 2)..."
if [ -f "frontend/public/worklets/voice-processor.js" ] && [ -f "frontend/public/worklets/continuous-voice-processor.js" ]; then
    echo "✅ AudioWorklet files exist"
else
    echo "❌ AudioWorklet files missing"
fi

# Test 2: Check if enhanced audio handling is implemented
echo "✅ Testing Enhanced Audio Processing (Issues 2, 3, 5)..."
if grep -q "AudioWorkletNode" frontend/src/hooks/useVoiceCapture.ts; then
    echo "✅ AudioWorklet integration found in useVoiceCapture"
else
    echo "❌ AudioWorklet integration missing in useVoiceCapture"
fi

if grep -q "shouldProcess.*!isMuted.*!isAISpeaking" frontend/src/hooks/useContinuousVoiceCapture.ts; then
    echo "✅ Smart audio processing logic found"
else
    echo "❌ Smart audio processing logic missing"
fi

# Test 3: Check WebSocket race condition fixes
echo "✅ Testing WebSocket Connection Fixes (Issue 4)..."
if grep -q "connectionStateRef" frontend/src/App.tsx; then
    echo "✅ Connection state management found"
else
    echo "❌ Connection state management missing"
fi

if grep -q "reconnectTimeoutRef" frontend/src/App.tsx; then
    echo "✅ Reconnection logic found"
else
    echo "❌ Reconnection logic missing"
fi

# Test 4: Check memory management
echo "✅ Testing Memory Management (Issue 6)..."
if grep -q "MAX_FUNCTION_RESULT_SIZE" backend/main.py; then
    echo "✅ Memory management constants found"
else
    echo "❌ Memory management constants missing"
fi

if grep -q "truncate_large_result" backend/main.py; then
    echo "✅ Result truncation function found"
else
    echo "❌ Result truncation function missing"
fi

# Test 5: Check error recovery
echo "✅ Testing Error Recovery (Issue 7)..."
if grep -q "initAudioContext.*isRetry" frontend/src/hooks/useAudioPlayback.ts; then
    echo "✅ Audio context recovery found"
else
    echo "❌ Audio context recovery missing"
fi

if grep -q "reconnectAttempts" frontend/src/App.tsx; then
    echo "✅ WebSocket reconnection attempts found"
else
    echo "❌ WebSocket reconnection attempts missing"
fi

# Test 6: Check rate limiting
echo "✅ Testing Rate Limiting (Issue 9)..."
if grep -q "check_rate_limit" backend/main.py; then
    echo "✅ Rate limiting function found"
else
    echo "❌ Rate limiting function missing"
fi

if grep -q "RATE_LIMIT_.*_PER_MINUTE" backend/main.py; then
    echo "✅ Rate limiting constants found"
else
    echo "❌ Rate limiting constants missing"
fi

# Test 7: Check TypeScript compilation
echo "✅ Testing TypeScript Compilation..."
cd frontend
if npm run build > /dev/null 2>&1; then
    echo "✅ Frontend builds successfully"
else
    echo "❌ Frontend build failed"
fi
cd ..

# Test 8: Check Python syntax
echo "✅ Testing Python Syntax..."
if python -m py_compile backend/main.py && python -m py_compile backend/realtime_proxy.py; then
    echo "✅ Backend Python syntax valid"
else
    echo "❌ Backend Python syntax errors"
fi

# Test 9: Check dependencies
echo "✅ Testing Dependencies..."
cd frontend
if npm ls > /dev/null 2>&1; then
    echo "✅ Frontend dependencies OK"
else
    echo "⚠️ Frontend dependency issues (may be normal)"
fi
cd ..

if pip install -r backend/requirements.txt > /dev/null 2>&1; then
    echo "✅ Backend dependencies OK"
else
    echo "⚠️ Backend dependency issues (may need virtual environment)"
fi

echo ""
echo "🎉 Fix Testing Complete!"
echo "🚀 You can now run the application with:"
echo "   Backend: cd backend && python main.py"
echo "   Frontend: cd frontend && npm run dev"
echo ""
echo "💡 Key Improvements:"
echo "   • AudioWorklet for modern audio processing"
echo "   • Smart audio processing (no waste when AI speaking/muted)"
echo "   • Robust WebSocket connection handling"
echo "   • Memory management and result truncation"
echo "   • Automatic error recovery"
echo "   • Rate limiting protection"
echo "   • Enhanced HTTP/HTTPS compatibility"

#!/bin/bash

echo "🎤 Starting VoiceInbox with HANDS-FREE Voice Commands!"
echo "====================================================="

# Navigate to project root
cd /Users/kunal/voice-inbox-mvp

# Stop any existing processes
echo "🛑 Stopping any existing processes..."
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

# Start backend
echo "🚀 Starting backend server with hands-free VAD..."
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Start frontend in new terminal window  
echo "🌐 Starting frontend with hands-free UI..."
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
echo "🎉 VoiceInbox HANDS-FREE Mode is starting up!"
echo "🖥️  Frontend: http://localhost:5173"
echo "🔧 Backend: http://localhost:8000"
echo ""
echo "🎤 HANDS-FREE INSTRUCTIONS:"
echo "================================"
echo "1. Go to http://localhost:5173"
echo "2. Login with Google (wait for green connection dot)"
echo "3. Allow microphone permissions when prompted"
echo "4. Click 'Hands-Free ON' button"
echo "5. Just SPEAK NATURALLY - no button pressing needed!"
echo ""
echo "🗣️  Try saying:"
echo "   - 'How many unread emails do I have?'"
echo "   - 'Show me my important emails'"
echo "   - 'Draft an email to John saying hello'"
echo "   - 'What's in my inbox?'"
echo ""
echo "🎯 VISUAL INDICATORS:"
echo "   🟢 Green Circle  = Listening continuously"
echo "   🟠 Orange Circle = Speech detected!"
echo "   🟡 Yellow Circle = Processing your request"
echo "   🟣 Purple Circle = AI responding with audio"
echo ""
echo "⚠️  IMPORTANT FOR HANDS-FREE:"
echo "   • Speak clearly and naturally"
echo "   • Wait for purple circle before speaking again"
echo "   • No need to hold any buttons!"
echo "   • Perfect for driving, walking, multitasking!"
echo ""
echo "Press Ctrl+C to stop backend server"

# Wait for backend (frontend runs in separate terminal)
wait $BACKEND_PID 2>/dev/null
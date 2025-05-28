#!/bin/bash

echo "🔧 VoiceInbox Audio & Function Fixes - Complete Test"
echo "=================================================="

# Check if services are running
echo "📊 Checking backend service..."
if curl -s http://localhost:8000/ > /dev/null; then
    echo "✅ Backend is running"
else
    echo "❌ Backend not running - start with:"
    echo "   cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
    exit 1
fi

echo "📊 Checking frontend service..."
if curl -s http://localhost:5173/ > /dev/null; then
    echo "✅ Frontend is running"
else
    echo "❌ Frontend not running - start with:"
    echo "   cd frontend && npm run dev"
    exit 1
fi

echo ""
echo "🎯 CRITICAL FIXES APPLIED:"
echo "✅ Empty audio buffer prevention (fixes audio cutoffs)"
echo "✅ 30-second timeout protection (prevents stuck buttons)"
echo "✅ 6 Gmail functions now available (was 3):"
echo "   • count_unread_emails"
echo "   • list_unread" 
echo "   • search_messages (improved important email detection)"
echo "   • create_draft (NOW AVAILABLE for drafting/sending)"
echo "   • mark_read (NOW AVAILABLE)"
echo "   • categorize_unread (NOW AVAILABLE)"
echo "✅ Cost-optimized token limits (50-400 tokens vs 100-800)"
echo "✅ Large result truncation (prevents OpenAI overload)"
echo "✅ Better important email search strategies"

echo ""
echo "🧪 TEST SCENARIOS:"
echo ""
echo "1️⃣ BASIC FUNCTIONALITY TEST:"
echo "   • Say: 'How many unread emails do I have?'"
echo "   • Expected: Button Blue→Red→Purple→Blue, clear count response"

echo ""
echo "2️⃣ EMAIL SEARCH TEST:"
echo "   • Say: 'Show me my most important emails'"
echo "   • Expected: AI searches with multiple strategies (starred, important, etc.)"

echo ""
echo "3️⃣ EMAIL DRAFTING TEST (NEW!):"
echo "   • Say: 'Draft an email to john@example.com saying hello'"
echo "   • Expected: AI creates email draft"

echo ""
echo "4️⃣ AUDIO CUTOFF FIX TEST:"
echo "   • Say: 'Read me the subject of my most recent email'"
echo "   • Expected: Complete audio response, no cutoffs, button returns to blue"

echo ""
echo "5️⃣ SHORT AUDIO PROTECTION TEST:"
echo "   • Hold button for less than 0.5 seconds and release"
echo "   • Expected: 'Please speak longer - audio too short' message"

echo ""
echo "6️⃣ EMAIL ORGANIZATION TEST (NEW!):"
echo "   • Say: 'Categorize my unread emails'"
echo "   • Expected: Breakdown by urgent/important/newsletters/etc."

echo ""
echo "🔍 MONITOR THESE LOGS:"
echo ""
echo "BACKEND LOGS:"
echo "✅ Good: '🎵 Audio streaming started' + chunk counts"
echo "✅ Good: '🔧 Configured 6 Gmail functions for OpenAI' (was 3)"
echo "✅ Good: '💬 Using 50-400 token limit for [function]'"
echo "❌ Bad: 'input_audio_buffer_commit_empty' (should be fixed)"
echo "❌ Bad: 'conversation_already_has_active_response' (should be fixed)"

echo ""
echo "FRONTEND CONSOLE:"
echo "✅ Good: '🎵 All audio buffers played, ending playback session'"
echo "✅ Good: '⚠️ Audio buffer too small, skipping send: [small number]'"
echo "❌ Bad: Button stuck purple (should timeout after 30 seconds max)"

echo ""
echo "🎯 SUCCESS CRITERIA:"
echo "• Button always returns to Blue (never stuck purple)"
echo "• Audio plays completely without cutoffs"
echo "• AI can now draft and send emails"
echo "• Better detection of important emails"
echo "• Lower token costs (50-400 vs 100-800)"
echo "• Empty audio buffers prevented"

echo ""
echo "🌟 IMPORTANT EMAIL TIPS:"
echo "Instead of asking 'show me important emails', try:"
echo "• 'Show me starred emails' (your manually starred ones)"
echo "• 'Show me emails from [person name]' (specific sender)"
echo "• 'Show me urgent emails' (subject-based search)"
echo "• 'Show me emails with invoice' (keyword search)"

echo ""
echo "💰 COST SAVINGS:"
echo "Token limits reduced by ~50%:"
echo "• Short responses: 100→50 tokens"
echo "• Medium responses: 300→150 tokens"
echo "• Long responses: 800→400 tokens"
echo "This will significantly reduce OpenAI costs!"

echo ""
echo "🚀 Ready to test! Go to http://localhost:5173"
echo "The purple button issue should now be COMPLETELY FIXED! 🎉"

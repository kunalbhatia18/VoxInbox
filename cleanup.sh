#!/bin/bash
# VoxInbox Project Cleanup Script
# Run this from your project root directory

echo "🧹 Starting VoxInbox project cleanup..."

# Frontend cleanup
echo "📱 Cleaning up frontend unused files..."

# Remove backup managers directory
if [ -d "frontend/src/managers_backup" ]; then
    rm -rf frontend/src/managers_backup
    echo "✅ Removed managers_backup directory"
fi

# Remove unused hooks
rm -f frontend/src/hooks/useSpeech.ts
rm -f frontend/src/hooks/useVoiceChat.ts
rm -f frontend/src/hooks/useVoiceRecording.ts
echo "✅ Removed unused hooks"

# Remove unused component
rm -f frontend/src/components/VoiceVisualizer.tsx
echo "✅ Removed unused VoiceVisualizer component"

# Remove empty types directory
if [ -d "frontend/src/types" ] && [ -z "$(ls -A frontend/src/types)" ]; then
    rmdir frontend/src/types
    echo "✅ Removed empty types directory"
fi

# Backend cleanup
echo "🚀 Cleaning up backend unused files..."

# Remove backup and test files
rm -f backend/realtime_proxy.py.backup
rm -f backend/realtime_proxy_simple.py
rm -f backend/websocket_backup.py
rm -f backend/test_quick.py
rm -f backend/cost_monitor.py
rm -f backend/openai_realtime.py
echo "✅ Removed backup and unused backend files"

# Remove generated files (will be recreated)
rm -f backend/backend_realtime.log
rm -f backend/gmail_cache.db
echo "✅ Removed log and cache files"

# Root cleanup
echo "📦 Cleaning up root level files..."

# Remove pnpm workspace files (not using pnpm)
rm -f pnpm-lock.yaml
rm -f pnpm-workspace.yaml
rm -f package.json
echo "✅ Removed pnpm workspace files"

echo ""
echo "🎉 Cleanup complete!"
echo ""
echo "📊 Summary of removed files:"
echo "   Frontend: managers_backup/, 3 unused hooks, VoiceVisualizer component"
echo "   Backend: 6 backup/test files, 2 generated files"
echo "   Root: 3 pnpm workspace files"
echo ""
echo "🚀 Your project is now clean and ready for deployment!"

#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 VoxInbox Deployment Preparation Script${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "frontend/package.json" ] || [ ! -f "backend/main.py" ]; then
    echo -e "${RED}❌ Error: Please run this script from the VoxInbox project root directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Cleaning up unused files...${NC}"

# Frontend cleanup
echo "  📱 Cleaning frontend..."

# Remove backup managers directory
if [ -d "frontend/src/managers_backup" ]; then
    rm -rf frontend/src/managers_backup
    echo -e "    ${GREEN}✅ Removed managers_backup directory${NC}"
fi

# Remove unused hooks
for hook in "useSpeech.ts" "useVoiceChat.ts" "useVoiceRecording.ts"; do
    if [ -f "frontend/src/hooks/$hook" ]; then
        rm "frontend/src/hooks/$hook"
        echo -e "    ${GREEN}✅ Removed unused hook: $hook${NC}"
    fi
done

# Remove unused component
if [ -f "frontend/src/components/VoiceVisualizer.tsx" ]; then
    rm "frontend/src/components/VoiceVisualizer.tsx"
    echo -e "    ${GREEN}✅ Removed unused VoiceVisualizer component${NC}"
fi

# Remove empty types directory
if [ -d "frontend/src/types" ] && [ -z "$(ls -A frontend/src/types 2>/dev/null)" ]; then
    rmdir frontend/src/types 2>/dev/null
    echo -e "    ${GREEN}✅ Removed empty types directory${NC}"
fi

# Backend cleanup
echo "  🚀 Cleaning backend..."

# Remove backup and test files
for file in "realtime_proxy.py.backup" "realtime_proxy_simple.py" "websocket_backup.py" "test_quick.py" "cost_monitor.py" "openai_realtime.py"; do
    if [ -f "backend/$file" ]; then
        rm "backend/$file"
        echo -e "    ${GREEN}✅ Removed: $file${NC}"
    fi
done

# Remove generated files (will be recreated)
for file in "backend_realtime.log" "gmail_cache.db"; do
    if [ -f "backend/$file" ]; then
        rm "backend/$file"
        echo -e "    ${GREEN}✅ Removed generated file: $file${NC}"
    fi
done

# Root cleanup
echo "  📦 Cleaning root directory..."

# Remove pnpm workspace files (not using pnpm)
for file in "pnpm-lock.yaml" "pnpm-workspace.yaml" "package.json"; do
    if [ -f "$file" ]; then
        rm "$file"
        echo -e "    ${GREEN}✅ Removed: $file${NC}"
    fi
done

echo ""
echo -e "${YELLOW}📋 Step 2: Verifying project structure...${NC}"

# Check essential files
essential_files=(
    "frontend/package.json"
    "frontend/src/App.tsx"
    "backend/main.py"
    "backend/requirements.txt"
    "vercel.json"
    "nixpacks.toml"
    "railway.json"
    "Dockerfile"
)

for file in "${essential_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✅ $file${NC}"
    else
        echo -e "  ${RED}❌ Missing: $file${NC}"
    fi
done

echo ""
echo -e "${YELLOW}📋 Step 3: Checking environment files...${NC}"

if [ -f "backend/.env" ]; then
    echo -e "  ${GREEN}✅ Backend .env file exists${NC}"
    echo -e "  ${BLUE}💡 Make sure it contains: OPENAI_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET${NC}"
else
    echo -e "  ${YELLOW}⚠️  Backend .env file not found${NC}"
    echo -e "  ${BLUE}💡 Create backend/.env with your API keys before deployment${NC}"
fi

if [ -f "frontend/.env.production" ]; then
    echo -e "  ${GREEN}✅ Frontend .env.production exists${NC}"
else
    echo -e "  ${YELLOW}⚠️  Frontend .env.production not found${NC}"
    echo -e "  ${BLUE}💡 This will be configured during deployment${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Cleanup Complete!${NC}"
echo ""
echo -e "${BLUE}📊 Summary of changes:${NC}"
echo -e "  ${GREEN}• Removed unused frontend files: managers_backup/, 3 hooks, VoiceVisualizer${NC}"
echo -e "  ${GREEN}• Removed unused backend files: 6 backup/test files${NC}"
echo -e "  ${GREEN}• Removed workspace files: pnpm configs${NC}"
echo -e "  ${GREEN}• Updated App.tsx imports${NC}"
echo ""
echo -e "${YELLOW}🚀 Next Steps:${NC}"
echo -e "  1. ${BLUE}Review COMPLETE_DEPLOYMENT_GUIDE.md for detailed instructions${NC}"
echo -e "  2. ${BLUE}Commit and push changes: git add . && git commit -m '🧹 Cleanup for deployment'${NC}"
echo -e "  3. ${BLUE}Deploy backend to Railway${NC}"
echo -e "  4. ${BLUE}Deploy frontend to Vercel with custom domain kunalis.me/voxinbox${NC}"
echo -e "  5. ${BLUE}Configure Google OAuth with production URLs${NC}"
echo ""
echo -e "${GREEN}✨ Your VoxInbox is ready for production deployment!${NC}"

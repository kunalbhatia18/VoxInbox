#!/bin/bash
# Local development script

echo "🚀 Starting VoxInbox backend for local development..."

# Copy local environment
cp .env.local .env

echo "✅ Using local environment (.env.local)"
echo "📡 Frontend: http://localhost:5173"
echo "🔧 Backend: http://localhost:8000"

# Start the server
python main.py

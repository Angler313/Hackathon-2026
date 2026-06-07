#!/bin/bash
# Start Coastal Angler Guide dev servers
# Run this once to get both server running. Safe to run multiple times.

export PATH="$HOME/.local/bin:$PATH"

echo "Killing old servers..."
kill $(lsof -ti:3001) $(lsof -ti:5173) 2>/dev/null
sleep 1

echo "Building API..."
cd /workspaces/Hackathon-2026/Coastal-Angler-Guide/artifacts/api-server
node build.mjs

echo "Starting API server (port 3001)..."
setsid bash -c 'DATABASE_URL="postgres://vscode:password@localhost:5432/fishing_guide" PORT=3001 node --enable-source-maps /workspaces/Hackathon-2026/Coastal-Angler-Guide/artifacts/api-server/dist/index.mjs' < /dev/null > /tmp/api-server.log 2>&1 &
sleep 3

echo "Starting Vite dev server (port 5173)..."
cd /workspaces/Hackathon-2026/Coastal-Angler-Guide/artifacts/fishing-app
setsid bash -c 'cd /workspaces/Hackathon-2026/Coastal-Angler-Guide/artifacts/fishing-app && PORT=5173 BASE_PATH=/ npx vite --config vite.config.ts --host 0.0.0.0' < /dev/null > /tmp/vite-fishing.log 2>&1 &
sleep 5

echo ""
echo "✅ Ready! Visit http://localhost:5173/"
echo ""
echo "Logs: /tmp/api-server.log, /tmp/vite-fishing.log"
echo "Restart: bash /workspaces/Hackathon-2026/Coastal-Angler-Guide/start.sh"

#!/bin/bash
# Run from inside backend/ (where this script lives).
set -e
echo "🚀 Starting CC Manager..."
echo ""

echo "▶ Checking for pending migrations..."
npm run migrate

echo "▶ Starting backend on http://localhost:3001"
npm start &
BACKEND_PID=$!

sleep 2

echo "▶ Starting frontend on http://localhost:3000"
cd ../frontend && npm start

trap "kill $BACKEND_PID" EXIT

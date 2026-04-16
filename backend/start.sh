#!/bin/bash
echo "🚀 Starting CC Manager..."
echo ""

# Start backend in background
echo "▶ Starting backend on http://localhost:3001"
cd backend && npm start &
BACKEND_PID=$!

sleep 2

# Start frontend
echo "▶ Starting frontend on http://localhost:3000"
cd ../frontend && npm start

# Cleanup on exit
trap "kill $BACKEND_PID" EXIT

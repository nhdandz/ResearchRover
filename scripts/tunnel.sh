#!/bin/bash

# Cloudflare Tunnel Script for RRI
# Exposes both backend (8000) and frontend (3000)

echo "🚀 Starting Cloudflare Tunnels for RRI..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create temp files to store URLs
BACKEND_URL_FILE="/tmp/rri_backend_url.txt"
FRONTEND_URL_FILE="/tmp/rri_frontend_url.txt"

# Function to start backend tunnel
start_backend_tunnel() {
    echo -e "${BLUE}[1/2] Starting Backend Tunnel (port 8000)...${NC}"
    cloudflared tunnel --url http://localhost:8000 2>&1 | while read line; do
        echo "$line"
        # Extract the tunnel URL
        if [[ "$line" == *"trycloudflare.com"* ]]; then
            URL=$(echo "$line" | grep -o 'https://[^[:space:]]*trycloudflare.com')
            if [ ! -z "$URL" ]; then
                echo "$URL" > "$BACKEND_URL_FILE"
                echo ""
                echo -e "${GREEN}✅ Backend URL: $URL${NC}"
                echo ""
                echo -e "${YELLOW}⚠️  IMPORTANT: Copy this URL and update docker-compose.yml:${NC}"
                echo "   NEXT_PUBLIC_API_URL=$URL"
                echo ""
                echo "   Then restart frontend: docker compose up -d --build frontend"
                echo ""
            fi
        fi
    done
}

# Function to start frontend tunnel
start_frontend_tunnel() {
    echo -e "${BLUE}Starting Frontend Tunnel (port 3000)...${NC}"
    cloudflared tunnel --url http://localhost:3000 2>&1 | while read line; do
        echo "$line"
        if [[ "$line" == *"trycloudflare.com"* ]]; then
            URL=$(echo "$line" | grep -o 'https://[^[:space:]]*trycloudflare.com')
            if [ ! -z "$URL" ]; then
                echo "$URL" > "$FRONTEND_URL_FILE"
                echo ""
                echo -e "${GREEN}✅ Frontend URL: $URL${NC}"
                echo -e "${GREEN}   Share this URL with others to access your app!${NC}"
                echo ""
            fi
        fi
    done
}

# Check which mode to run
case "$1" in
    "backend")
        start_backend_tunnel
        ;;
    "frontend")
        start_frontend_tunnel
        ;;
    *)
        echo "Usage: $0 [backend|frontend]"
        echo ""
        echo "Steps:"
        echo "  1. Run: ./scripts/tunnel.sh backend"
        echo "  2. Copy the backend URL and update docker-compose.yml"
        echo "  3. Restart frontend: docker compose up -d --build frontend"
        echo "  4. Run in new terminal: ./scripts/tunnel.sh frontend"
        echo ""
        ;;
esac

#!/bin/sh
# Webhook handler for rclone sync trigger
# Receives HTTP requests from Vercel after uploads

# Read the HTTP request
read -r REQUEST_LINE
METHOD=$(echo "$REQUEST_LINE" | cut -d' ' -f1)
PATH_REQ=$(echo "$REQUEST_LINE" | cut -d' ' -f2)

# Read headers
CONTENT_LENGTH=0
AUTH_HEADER=""
while IFS= read -r header; do
  header=$(echo "$header" | tr -d '\r')
  [ -z "$header" ] && break
  case "$header" in
    Content-Length:*|content-length:*) CONTENT_LENGTH=$(echo "$header" | cut -d' ' -f2) ;;
    Authorization:*|authorization:*) AUTH_HEADER=$(echo "$header" | cut -d' ' -f2-) ;;
  esac
done

# Read body if present
BODY=""
if [ "$CONTENT_LENGTH" -gt 0 ] 2>/dev/null; then
  BODY=$(dd bs=1 count="$CONTENT_LENGTH" 2>/dev/null)
fi

# Health check
if [ "$PATH_REQ" = "/health" ]; then
  RESPONSE='{"status":"ok"}'
  printf "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" ${#RESPONSE} "$RESPONSE"
  exit 0
fi

# Only accept POST /sync
if [ "$METHOD" != "POST" ] || [ "$PATH_REQ" != "/sync" ]; then
  RESPONSE='{"error":"not found"}'
  printf "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" ${#RESPONSE} "$RESPONSE"
  exit 0
fi

# Verify secret
EXPECTED="Bearer $WEBHOOK_SECRET"
if [ "$AUTH_HEADER" != "$EXPECTED" ]; then
  RESPONSE='{"error":"unauthorized"}'
  printf "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" ${#RESPONSE} "$RESPONSE"
  exit 0
fi

# Respond immediately (sync runs in background)
RESPONSE='{"status":"sync started"}'
printf "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" ${#RESPONSE} "$RESPONSE"

# Run rclone copy in background (B2 -> NAS, one-way)
# Using 'copy' instead of 'bisync' to reduce API calls
(
  echo "[$(date)] Sync triggered by webhook"
  rclone copy backblaze:nettnett1/ /data/ --transfers 4 --checkers 8 -v 2>&1
  echo "[$(date)] Sync completed"
) >> /config/sync.log 2>&1 &

#!/bin/sh
# Webhook handler for rclone sync and Internet Archive uploads
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

# ── Verify auth for all POST endpoints ──
if [ "$METHOD" = "POST" ]; then
  EXPECTED="Bearer $WEBHOOK_SECRET"
  if [ "$AUTH_HEADER" != "$EXPECTED" ]; then
    RESPONSE='{"error":"unauthorized"}'
    printf "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" ${#RESPONSE} "$RESPONSE"
    exit 0
  fi
fi

# ── POST /sync — Rclone B2 → NAS sync ──
if [ "$METHOD" = "POST" ] && [ "$PATH_REQ" = "/sync" ]; then
  RESPONSE='{"status":"sync started"}'
  printf "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" ${#RESPONSE} "$RESPONSE"

  # Run rclone copy in background (B2 -> NAS, one-way)
  (
    echo "[$(date)] Sync triggered by webhook"
    rclone copy backblaze:nettnett1/ /data/ --transfers 4 --checkers 8 -v 2>&1
    echo "[$(date)] Sync completed"
  ) >> /config/sync.log 2>&1 &

  exit 0
fi

# ── POST /delete-item — Delete specific item folder from NAS ──
if [ "$METHOD" = "POST" ] && [ "$PATH_REQ" = "/delete-item" ]; then
  # Parse JSON body before background process
  USER_FOLDER=$(echo "$BODY" | jq -r '.userFolder // empty')
  TITLE_FOLDER=$(echo "$BODY" | jq -r '.titleFolder // empty')

  RESPONSE='{"status":"delete started"}'
  printf "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" ${#RESPONSE} "$RESPONSE"

  # Validate before fork
  if [ -z "$USER_FOLDER" ] || [ -z "$TITLE_FOLDER" ]; then
    echo "[$(date)] ERROR: delete-item missing required fields. Body was: $BODY" >> /config/delete.log
    exit 0
  fi

  # Safety: block path traversal
  case "$USER_FOLDER$TITLE_FOLDER" in
    *..* )
      echo "[$(date)] ERROR: path traversal attempt blocked: ${USER_FOLDER}/${TITLE_FOLDER}" >> /config/delete.log
      exit 0
      ;;
  esac

  ITEM_PATH="/data/${USER_FOLDER}/${TITLE_FOLDER}"

  # Delete folder in background
  (
    echo "[$(date)] Delete triggered for ${USER_FOLDER}/${TITLE_FOLDER}"
    if [ -d "$ITEM_PATH" ]; then
      rm -rf "$ITEM_PATH"
      echo "[$(date)] Deleted: ${ITEM_PATH}"
    else
      echo "[$(date)] Path not found (already deleted?): ${ITEM_PATH}"
    fi
    echo "[$(date)] Delete completed"
  ) >> /config/delete.log 2>&1 &

  exit 0
fi

# ── POST /ia-upload — Upload files to Internet Archive ──
if [ "$METHOD" = "POST" ] && [ "$PATH_REQ" = "/ia-upload" ]; then
  # Parse JSON body BEFORE background process (socat loses $BODY in subshell via Cloudflare Tunnel)
  USER_FOLDER=$(echo "$BODY" | jq -r '.userFolder // empty')
  TITLE_FOLDER=$(echo "$BODY" | jq -r '.titleFolder // empty')
  IA_IDENTIFIER=$(echo "$BODY" | jq -r '.iaIdentifier // empty')

  RESPONSE='{"status":"ia-upload started"}'
  printf "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" ${#RESPONSE} "$RESPONSE"

  # Validate before fork
  if [ -z "$USER_FOLDER" ] || [ -z "$TITLE_FOLDER" ] || [ -z "$IA_IDENTIFIER" ]; then
    echo "[$(date)] ERROR: Missing required fields. Body was: $BODY" >> /config/ia-upload.log
    exit 0
  fi

  ITEM_PATH="/data/${USER_FOLDER}/${TITLE_FOLDER}"

  # Run IA upload in background (only uses pre-parsed variables, not $BODY)
  (
    echo "[$(date)] IA upload triggered for ${IA_IDENTIFIER}"
    echo "[$(date)] userFolder=${USER_FOLDER} titleFolder=${TITLE_FOLDER}"

    # Step 1: Sync just this item folder from B2 to ensure files are local
    echo "[$(date)] Syncing item folder from B2..."
    rclone copy "backblaze:nettnett1/${USER_FOLDER}/${TITLE_FOLDER}/" "${ITEM_PATH}/" --transfers 4 -v 2>&1
    echo "[$(date)] Item folder synced"

    # Step 2: Read metadata.json for IA headers
    METADATA_FILE="${ITEM_PATH}/metadata.json"
    if [ ! -f "$METADATA_FILE" ]; then
      echo "[$(date)] ERROR: metadata.json not found at ${METADATA_FILE}"
      exit 1
    fi

    TITLE=$(jq -r '.title // empty' "$METADATA_FILE")
    DESCRIPTION=$(jq -r '.description // empty' "$METADATA_FILE")
    MEDIATYPE=$(jq -r '.mediatype // "data"' "$METADATA_FILE")
    CREATOR=$(jq -r '.creator // empty' "$METADATA_FILE")
    DATE_VAL=$(jq -r '.date // empty' "$METADATA_FILE")
    LANGUAGE=$(jq -r '.language // empty' "$METADATA_FILE")

    # Get subject tags as array
    SUBJECT_COUNT=$(jq '.subject | length' "$METADATA_FILE" 2>/dev/null || echo "0")

    echo "[$(date)] Uploading to IA: identifier=${IA_IDENTIFIER}, title=${TITLE}, mediatype=${MEDIATYPE}"

    # Step 3: Upload each file (except metadata.json) to Internet Archive
    FIRST_FILE=1
    for FILE_PATH in "${ITEM_PATH}"/*; do
      [ ! -f "$FILE_PATH" ] && continue

      FILENAME=$(basename "$FILE_PATH")
      [ "$FILENAME" = "metadata.json" ] && continue

      # URL-encode filename (basic: replace spaces with %20)
      ENCODED_FILENAME=$(echo "$FILENAME" | sed 's/ /%20/g; s/\[/%5B/g; s/\]/%5D/g; s/(/%28/g; s/)/%29/g')

      IA_URL="https://s3.us.archive.org/${IA_IDENTIFIER}/${ENCODED_FILENAME}"

      echo "[$(date)] Uploading: ${FILENAME} -> ${IA_URL}"

      if [ "$FIRST_FILE" = "1" ]; then
        # First file: include all metadata headers to create the IA item
        # Use a curl config file to avoid eval (which breaks on spaces in paths)
        CURL_CONFIG=$(mktemp)

        echo 'header = "x-archive-auto-make-bucket: 1"' >> "$CURL_CONFIG"
        echo "header = \"x-archive-meta-mediatype: ${MEDIATYPE}\"" >> "$CURL_CONFIG"
        echo 'header = "x-archive-meta-collection: opensource"' >> "$CURL_CONFIG"

        if [ -n "$TITLE" ]; then
          ENCODED_TITLE=$(echo "$TITLE" | jq -sRr '@uri')
          echo "header = \"x-archive-meta-title: uri(${ENCODED_TITLE})\"" >> "$CURL_CONFIG"
        fi

        if [ -n "$DESCRIPTION" ]; then
          ENCODED_DESC=$(echo "$DESCRIPTION" | jq -sRr '@uri')
          echo "header = \"x-archive-meta-description: uri(${ENCODED_DESC})\"" >> "$CURL_CONFIG"
        fi

        if [ -n "$CREATOR" ]; then
          ENCODED_CREATOR=$(echo "$CREATOR" | jq -sRr '@uri')
          echo "header = \"x-archive-meta-creator: uri(${ENCODED_CREATOR})\"" >> "$CURL_CONFIG"
        fi

        if [ -n "$DATE_VAL" ]; then
          echo "header = \"x-archive-meta-date: ${DATE_VAL}\"" >> "$CURL_CONFIG"
        fi

        if [ -n "$LANGUAGE" ]; then
          echo "header = \"x-archive-meta-language: ${LANGUAGE}\"" >> "$CURL_CONFIG"
        fi

        # Add subject tags (numbered headers)
        i=1
        while [ "$i" -le "$SUBJECT_COUNT" ]; do
          IDX=$((i - 1))
          SUBJ=$(jq -r ".subject[${IDX}]" "$METADATA_FILE")
          if [ -n "$SUBJ" ]; then
            PADDED=$(printf "%02d" "$i")
            ENCODED_SUBJ=$(echo "$SUBJ" | jq -sRr '@uri')
            echo "header = \"x-archive-meta${PADDED}-subject: uri(${ENCODED_SUBJ})\"" >> "$CURL_CONFIG"
          fi
          i=$((i + 1))
        done

        curl -L --location-trusted -X PUT \
          -H "Authorization: LOW ${IA_S3_ACCESS_KEY}:${IA_S3_SECRET_KEY}" \
          -H "Content-Type: application/octet-stream" \
          -K "$CURL_CONFIG" \
          --data-binary "@${FILE_PATH}" \
          "${IA_URL}" 2>&1

        rm -f "$CURL_CONFIG"
        FIRST_FILE=0
      else
        # Subsequent files: only auth and content-type
        curl -L --location-trusted -X PUT \
          -H "Authorization: LOW ${IA_S3_ACCESS_KEY}:${IA_S3_SECRET_KEY}" \
          -H "Content-Type: application/octet-stream" \
          --data-binary "@${FILE_PATH}" \
          "${IA_URL}" 2>&1
      fi

      CURL_STATUS=$?
      if [ "$CURL_STATUS" -ne 0 ]; then
        echo "[$(date)] ERROR: curl failed for ${FILENAME} with exit code ${CURL_STATUS}"
      else
        echo "[$(date)] Uploaded: ${FILENAME}"
      fi
    done

    echo "[$(date)] IA upload completed for ${IA_IDENTIFIER}"
  ) >> /config/ia-upload.log 2>&1 &

  exit 0
fi

# ── Fallback: 404 ──
RESPONSE='{"error":"not found"}'
printf "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s" ${#RESPONSE} "$RESPONSE"

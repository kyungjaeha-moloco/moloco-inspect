#!/bin/bash
set -euo pipefail

# ─── Preview Server + Screenshot Capture ─────────────────────────────
# Starts Vite dev server inside the container, waits for it to be ready,
# then captures a screenshot using Playwright.

RESULTS_DIR="/workspace/results"
mkdir -p "$RESULTS_DIR"

APP_DIR="/workspace/msm-portal/js/msm-portal-web"
CLIENT="${CLIENT:-msm-default}"
MODE="${MODE:-test}"
PORT=5173

# ─── 1. Start Vite dev server (background) ──────────────────────────
cd "$APP_DIR"
CLIENT=$CLIENT MODE=$MODE pnpm exec vite \
  --mode "$MODE" \
  --host 0.0.0.0 \
  --strictPort \
  --port $PORT &
VITE_PID=$!

cleanup() {
  kill $VITE_PID 2>/dev/null || true
}
trap cleanup EXIT

# ─── 2. Wait for server ready (max 60s) ─────────────────────────────
TIMEOUT=60
ELAPSED=0
echo "Waiting for Vite on port $PORT..."
until wget -q -O /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "ERROR: Vite did not start within ${TIMEOUT}s" >&2
    exit 1
  fi
done
echo "Vite ready after ${ELAPSED}s"

# ─── 3. Capture screenshot ───────────────────────────────────────────
PREVIEW_URL="${PREVIEW_URL:-http://127.0.0.1:$PORT/}"
SCREENSHOT_PATH="$RESULTS_DIR/screenshot.png"
LANGUAGE="${LANGUAGE:-}"

if [ -f "$APP_DIR/e2e/screenshot-util.ts" ]; then
  cd "$APP_DIR"
  pnpm exec tsx e2e/screenshot-util.ts \
    "$PREVIEW_URL" \
    "$SCREENSHOT_PATH" \
    "$LANGUAGE" \
    "$CLIENT"
  echo "Screenshot saved: $SCREENSHOT_PATH"
else
  echo "WARN: screenshot-util.ts not found, skipping screenshot capture"
fi

# ─── 4. Keep Vite running for live preview access ────────────────────
# Container will be removed by orchestrator, which kills Vite too
echo "Preview server running at http://0.0.0.0:$PORT"
echo "PREVIEW_READY"
wait $VITE_PID

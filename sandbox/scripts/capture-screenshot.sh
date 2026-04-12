#!/bin/bash
set -euo pipefail

# ─── Standalone Screenshot Capture ───────────────────────────────────
# Use when Vite is already running. Captures a screenshot of the given URL.

RESULTS_DIR="/workspace/results"
mkdir -p "$RESULTS_DIR"

APP_DIR="/workspace/msm-portal/js/msm-portal-web"
PREVIEW_URL="${1:-http://127.0.0.1:5173/}"
SCREENSHOT_PATH="${2:-$RESULTS_DIR/screenshot.png}"
LANGUAGE="${3:-}"
CLIENT="${4:-msm-default}"

if [ -f "$APP_DIR/e2e/screenshot-util.ts" ]; then
  cd "$APP_DIR"
  pnpm exec tsx e2e/screenshot-util.ts \
    "$PREVIEW_URL" \
    "$SCREENSHOT_PATH" \
    "$LANGUAGE" \
    "$CLIENT"
  echo "Screenshot saved: $SCREENSHOT_PATH"
else
  echo "ERROR: screenshot-util.ts not found" >&2
  exit 1
fi

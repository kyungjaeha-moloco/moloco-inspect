#!/bin/bash
# Install Native Messaging Host for Click-to-Inspect Chrome Extension
# Usage: ./install.sh [extension-id] [project-root]
#
# Example:
#   ./install.sh abcdefghijklmnopqrstuvwxyz /Users/me/my-project
#
# This script:
# 1. Installs inspect-bridge.js to ~/.local/bin/ (no sudo required)
# 2. Registers the Native Messaging Host manifest with Chrome (and Chromium browsers)
# 3. Optionally sets the project root path

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.claudecode.inspect"
BRIDGE_SRC="$SCRIPT_DIR/inspect-bridge.js"
BRIDGE_DST="$HOME/.local/bin/inspect-bridge"

# Chrome Native Messaging Hosts directories (macOS)
CHROME_NM_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
CHROMIUM_NM_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
BRAVE_NM_DIR="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
EDGE_NM_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
ARC_NM_DIR="$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts"

EXTENSION_ID="${1:-}"
PROJECT_ROOT="${2:-}"

echo "=== Click-to-Inspect Native Host Installer ==="
echo ""

# C1 fix: Validate extension ID
if [ -z "$EXTENSION_ID" ]; then
  echo "ERROR: Extension ID is required."
  echo ""
  echo "Usage: ./install.sh <extension-id> [project-root]"
  echo ""
  echo "To find your extension ID:"
  echo "  1. Open chrome://extensions"
  echo "  2. Enable Developer mode"
  echo "  3. Click 'Load unpacked' → select the chrome-extension/ folder"
  echo "  4. Copy the ID shown under the extension name"
  echo "  5. Run this script again with that ID"
  exit 1
fi

# Validate extension ID format (32 lowercase letters)
if ! echo "$EXTENSION_ID" | grep -qE '^[a-z]{32}$'; then
  echo "WARNING: Extension ID '$EXTENSION_ID' doesn't look like a standard Chrome extension ID."
  echo "  Expected: 32 lowercase letters (e.g., abcdefghijklmnopqrstuvwxyzabcdef)"
  read -p "  Continue anyway? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# m5 fix: Install to ~/.local/bin (no sudo required)
echo "[1/3] Installing inspect-bridge to $BRIDGE_DST ..."
mkdir -p "$(dirname "$BRIDGE_DST")"
cp "$BRIDGE_SRC" "$BRIDGE_DST"
chmod +x "$BRIDGE_DST"
echo "  Done."

# 2. Set project root if provided
if [ -n "$PROJECT_ROOT" ]; then
  echo "[2/3] Setting project root: $PROJECT_ROOT"
  echo "{\"projectRoot\": \"$PROJECT_ROOT\"}" > "$HOME/.click-to-inspect-config.json"
else
  echo "[2/3] No project root specified (will use default: ~/Documents/moloco-inspect)"
  echo "  To set later: edit ~/.click-to-inspect-config.json or use the extension popup"
fi

# 3. Register Native Messaging Host manifest (C1 fix: include extension ID)
echo "[3/3] Registering Native Messaging Host ..."

MANIFEST="{
  \"name\": \"$HOST_NAME\",
  \"description\": \"Click-to-Inspect bridge for Claude Code\",
  \"path\": \"$BRIDGE_DST\",
  \"type\": \"stdio\",
  \"allowed_origins\": [\"chrome-extension://$EXTENSION_ID/\"]
}"

install_manifest() {
  local dir="$1"
  local name="$2"
  if [ -d "$(dirname "$dir")" ]; then
    mkdir -p "$dir"
    echo "$MANIFEST" > "$dir/$HOST_NAME.json"
    echo "  Registered for $name"
  fi
}

install_manifest "$CHROME_NM_DIR" "Chrome"
install_manifest "$CHROMIUM_NM_DIR" "Chromium"
install_manifest "$BRAVE_NM_DIR" "Brave"
install_manifest "$EDGE_NM_DIR" "Edge"
install_manifest "$ARC_NM_DIR" "Arc"

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Extension ID: $EXTENSION_ID"
echo "Bridge path:  $BRIDGE_DST"
echo "Config path:  $HOME/.click-to-inspect-config.json"
echo ""
echo "Press Alt+Shift+X on any localhost page to start inspecting!"

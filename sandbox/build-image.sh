#!/bin/bash
set -euo pipefail

# ─── Build Moloco Inspect Sandbox Image ──────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

IMAGE_NAME="${IMAGE_NAME:-moloco-inspect-sandbox}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "Building ${IMAGE_NAME}:${IMAGE_TAG}..."
echo "Context: $REPO_ROOT"

DOCKER_BUILDKIT=1 docker build \
  --secret id=npmrc,src="${HOME}/.npmrc" \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -f "$SCRIPT_DIR/Dockerfile" \
  "$REPO_ROOT"

SIZE=$(docker images "${IMAGE_NAME}:${IMAGE_TAG}" --format '{{.Size}}')
echo ""
echo "Build complete!"
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "Size: $SIZE"

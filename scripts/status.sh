#!/bin/bash
# Moloco Inspect — System Status Check
# Usage: bash scripts/status.sh

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Moloco Inspect — Status Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Orchestrator
ORCH=$(curl -s --max-time 3 http://127.0.0.1:3847/api/health 2>/dev/null)
if [ -n "$ORCH" ]; then
  MODEL=$(echo "$ORCH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model','?'))" 2>/dev/null)
  REQS=$(echo "$ORCH" | python3 -c "import sys,json; print(json.load(sys.stdin).get('requests',0))" 2>/dev/null)
  echo "  ✅ Orchestrator    :3847  model=$MODEL  requests=$REQS"
else
  echo "  ❌ Orchestrator    :3847  DOWN"
fi

# Inspect Hub
HUB=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:4174/ 2>/dev/null)
[ "$HUB" = "200" ] && echo "  ✅ Inspect Hub      :4174" || echo "  ❌ Inspect Hub      :4174  DOWN"

# DS Site
DS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:4176/ 2>/dev/null)
[ "$DS" = "200" ] && echo "  ✅ DS Site          :4176" || echo "  ❌ DS Site          :4176  DOWN"

# Product App
PROD=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:8000/ 2>/dev/null)
[ "$PROD" = "200" ] && echo "  ✅ Product App      :8000" || echo "  ❌ Product App      :8000  DOWN"

echo ""

# Docker
SANDBOX_COUNT=$(docker ps --filter 'name=inspect-' --format '{{.Names}}' 2>/dev/null | wc -l | tr -d ' ')
DOCKER_STATUS=$(docker info > /dev/null 2>&1 && echo "running" || echo "stopped")
echo "  🐳 Docker           $DOCKER_STATUS"
echo "  📦 Sandboxes        $SANDBOX_COUNT running"

if [ "$SANDBOX_COUNT" -gt 0 ]; then
  echo ""
  docker ps --filter 'name=inspect-' --format '     {{.Names}}  {{.Status}}  {{.Ports}}' 2>/dev/null | sed 's/0.0.0.0://g' | head -10
  [ "$SANDBOX_COUNT" -gt 10 ] && echo "     ... and $((SANDBOX_COUNT - 10)) more"
fi

echo ""

# Git
GIT_COMMIT=$(git -C "$(dirname "$0")/.." log --oneline -1 2>/dev/null)
GIT_DIRTY=$(git -C "$(dirname "$0")/.." status --short 2>/dev/null | wc -l | tr -d ' ')
echo "  📝 Git              $GIT_COMMIT"
echo "  📝 Uncommitted      $GIT_DIRTY files"

echo ""

# State files
STATE_DIR="$(dirname "$0")/../orchestrator/state"
if [ -d "$STATE_DIR" ]; then
  STATE_COUNT=$(ls "$STATE_DIR"/*.json 2>/dev/null | wc -l | tr -d ' ')
  echo "  💾 Persisted State  $STATE_COUNT requests"
else
  echo "  💾 Persisted State  0 requests"
fi

# Analytics
ANALYTICS="$(dirname "$0")/../orchestrator/analytics/request-history.ndjson"
if [ -f "$ANALYTICS" ]; then
  EVENTS=$(wc -l < "$ANALYTICS" | tr -d ' ')
  echo "  📊 Analytics        $EVENTS events"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

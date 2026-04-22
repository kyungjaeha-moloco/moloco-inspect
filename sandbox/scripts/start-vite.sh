#!/usr/bin/env bash
# Entry point used by supervisord to launch Vite for msm-portal-web.
#
# When the orchestrator materializes the playground wrapper config
# (`vite.config.playground.ts` — written after source copy, see
# orchestrator/lib/playground.js), we prefer that so the picker plugin is
# in play. Otherwise fall back to the default config so pre-M3 sandboxes
# (and the legacy stateless path) still boot.
set -eu
cd /workspace/msm-portal/js/msm-portal-web

CONFIG_ARGS=()
if [ -f vite.config.playground.ts ]; then
  CONFIG_ARGS=(--config vite.config.playground.ts)
fi

exec npx vite "${CONFIG_ARGS[@]}" --mode test --host 0.0.0.0 --port 5173 --strictPort

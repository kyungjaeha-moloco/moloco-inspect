#!/usr/bin/env bash
set -eu
cd /workspace/msm-portal/js/msm-portal-web
exec npx vite --mode test --host 0.0.0.0 --port 5173 --strictPort

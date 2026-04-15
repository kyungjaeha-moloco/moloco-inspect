# Moloco Inspect — Sandbox Container Image
# Base: OpenCode official image (Alpine) — ensures opencode binary works natively
# Added: Node.js + pnpm + Chromium + msm-portal + design-system

FROM ghcr.io/anomalyco/opencode

# ─── System dependencies ─────────────────────────────────────────────
# Alpine apk needs --allow-untrusted due to corporate proxy TLS interception
RUN apk add --no-cache --allow-untrusted \
  nodejs npm git curl bash ca-certificates \
  chromium nss freetype harfbuzz ttf-freefont font-noto-cjk \
  || (echo "Retrying with http repos..." \
  && sed -i 's|https://|http://|g' /etc/apk/repositories \
  && apk add --no-cache \
    nodejs npm git curl bash ca-certificates \
    chromium nss freetype harfbuzz ttf-freefont font-noto-cjk)

# Inject host CA bundle
COPY sandbox/host-ca.pem /usr/local/share/ca-certificates/host-ca.crt
RUN update-ca-certificates 2>/dev/null || true

# SSL workaround for corporate environments
ENV NODE_TLS_REJECT_UNAUTHORIZED=0
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV npm_config_strict_ssl=false

# pnpm
RUN npm install -g pnpm@9

# Playwright: use system Chromium (skip browser download, use pre-installed)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
RUN npm install -g playwright-core && npm install -g playwright

# ─── msm-portal: pre-bake node_modules for fast cold start ──────────
# Copy only dependency manifests first (Docker layer caching)
RUN mkdir -p /workspace/msm-portal/js/msm-portal-web
COPY sandbox/msm-portal-deps/package.json /workspace/msm-portal/js/msm-portal-web/package.json
COPY sandbox/msm-portal-deps/pnpm-lock.yaml /workspace/msm-portal/js/msm-portal-web/pnpm-lock.yaml
# .npmrc injected at build time via --secret for private registry auth
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    cd /workspace/msm-portal/js/msm-portal-web && (pnpm install --frozen-lockfile || pnpm install)
WORKDIR /workspace/msm-portal

# ─── design-system ───────────────────────────────────────────────────
COPY design-system /workspace/design-system

# ─── OpenCode config (provider timeout = 20min) ─────────────────────
RUN mkdir -p /workspace/msm-portal/.opencode/agents
COPY sandbox/opencode.json /workspace/msm-portal/opencode.json

# ─── OpenCode agent definitions ──────────────────────────────────────
COPY sandbox/agents /workspace/msm-portal/.opencode/agents/

# ─── Internal scripts ────────────────────────────────────────────────
COPY sandbox/scripts /workspace/scripts/
RUN chmod +x /workspace/scripts/*.sh 2>/dev/null || true

# ─── Results directory ───────────────────────────────────────────────
RUN mkdir -p /workspace/results

# ─── Git init (needed for OpenCode and diff collection) ──────────────
RUN cd /workspace/msm-portal && git init && git config user.email "sandbox@local" && git config user.name "Sandbox"

# ─── Ports ───────────────────────────────────────────────────────────
EXPOSE 4096 5173

WORKDIR /workspace/msm-portal

ENTRYPOINT []
CMD ["opencode", "serve", "--port", "4096", "--hostname", "0.0.0.0"]

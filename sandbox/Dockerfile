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

# Playwright: use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# ─── msm-portal (placeholder — will be populated via docker cp) ──────
RUN mkdir -p /workspace/msm-portal
WORKDIR /workspace/msm-portal

# ─── design-system ───────────────────────────────────────────────────
COPY design-system /workspace/design-system

# ─── OpenCode agent definitions ──────────────────────────────────────
RUN mkdir -p /workspace/msm-portal/.opencode/agents
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

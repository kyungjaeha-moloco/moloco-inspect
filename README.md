# Moloco Inspect

An AI-powered product editing agent that lets PMs and SAs modify live UI through natural language. Select an element, describe what you want to change, and the agent plans, codes, validates, and previews the result — all from your browser.

## How It Works

```
Select Element ──> Describe Change ──> AI Plans ──> Agent Codes ──> Preview ──> Approve ──> PR
```

1. Open a live product page (localhost)
2. **Inspect** an element or **capture** a screen region (`Cmd+Shift+E`)
3. Describe the change in natural language, or attach a PRD link
4. The AI agent analyzes the request and proposes an execution plan
5. Confirm the plan — the agent modifies code in a sandboxed container
6. Review the **live preview** and **diff viewer** with syntax-highlighted changes
7. **Approve** to create a GitHub PR, or **request changes** to iterate

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Chrome Extension │────>│   Orchestrator   │────>│  Docker Sandbox     │
│  (Side Panel)    │<────│   (Node.js)      │<────│  (Agent + Vite)     │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
        │                       │                          │
   Element select          AI Analysis              Code modification
   Natural language        Diff extraction          Typecheck + Validate
   PRD ingest              Screenshot capture       Live preview server
   Plan review             PR creation              Bootstrap auth
        │                       │                          │
        v                       v                          v
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Inspect Hub        │     │  Design System   │     │  DS MCP Server      │
│  (Dashboard)     │     │  Site (Carbon)   │     │  (9 tools)          │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
```

## Project Structure

```
moloco-inspect/
├── chrome-extension/      # Browser extension (inspector, side panel, background)
├── orchestrator/          # Node.js server — pipeline, sandbox, AI analysis, PR creation
├── sandbox/               # Docker image + agent scripts for isolated code editing
├── dashboard/             # Inspect Hub — request tracking, analytics, settings
├── design-system/         # JSON source of truth — components, tokens, patterns
├── design-system-site/    # Design System documentation site (Carbon-style)
├── design-system-mcp/     # MCP server exposing DS data to AI tools (9 endpoints)
├── tooling/
│   ├── sandbox-manager/   # Container lifecycle management
│   └── preview-kit/       # Shared utilities (language normalization, etc.)
├── docs/                  # Architecture docs, handoffs, contracts
└── msm-portal -> ...      # Symlink to product repo
```

## Getting Started

### Prerequisites

- **Node.js** 18+
- **Docker Desktop** (for sandboxed agent execution)
- **pnpm** (package manager)
- **GitHub CLI** (`gh`) for PR creation

### Quick Start

```bash
# 1. Start Docker
open -a Docker

# 2. Build sandbox image
cp /etc/ssl/cert.pem sandbox/host-ca.pem
bash sandbox/build-image.sh

# 3. Start the orchestrator
cd orchestrator
ANTHROPIC_API_KEY="sk-ant-..." SANDBOX_MODEL=claude-sonnet-4-6 node server.js
# Runs on http://localhost:3847

# 4. Start Inspect Hub dashboard
cd dashboard && pnpm install && pnpm dev
# Runs on http://localhost:4174

# 5. Start Design System site (optional)
cd design-system-site && pnpm install && pnpm dev
# Runs on http://localhost:4176

# 6. Load Chrome Extension
# Go to chrome://extensions → Enable Developer Mode → Load Unpacked → select chrome-extension/
```

## Key Features

### Chrome Extension
- **Element Inspector** — click any element to get React component info, file path, styles
- **Region Capture** — drag to select a screen area for context
- **AI Analysis** — Claude analyzes your request and proposes a step-by-step plan
- **Plan Review** — approve, adjust, or provide structured requirements before execution
- **PRD Ingest** — attach a PRD link for context-aware changes

### Orchestrator
- **Pipeline Engine** — setup, code, validate, screenshot, preview, review
- **Sandboxed Execution** — Docker containers with isolated git + vite dev server
- **AI Analysis** — Claude Sonnet generates execution plans with risk assessment
- **Diff Viewer** — syntax-highlighted code review with approve/reject flow
- **Live Preview** — proxied vite server with automatic auth bootstrap
- **PR Creation** — one-click `gh pr create` from approved changes
- **Provider Auto-detect** — Anthropic (primary), OpenAI (fallback)

### Inspect Hub (Dashboard)
- **Overview** — success rate, daily requests, avg latency, error rate
- **Request Tracking** — full request lifecycle with AI analysis, diff, screenshots
- **Agent Performance** — per-agent metrics with stacked bar charts
- **Settings** — server URL, connection mode, system info

### Design System
- **95 Components** — complete JSON contracts with props, tokens, accessibility
- **Documentation Site** — Carbon-style with interactive previews, prop controls, anatomy diagrams
- **MCP Server** — 9 tools for AI-assisted component lookup, token resolution, pattern search
- **`llms.txt`** — AI-readable component index for LLM integrations

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check |
| `/api/request` | POST | Submit a new change request |
| `/api/request/:id` | GET | Get request status and details |
| `/api/requests` | GET | List all requests |
| `/api/analyze-request` | POST | AI-powered request analysis |
| `/api/approve/:id` | POST | Approve changes and create PR |
| `/api/reject/:id` | POST | Reject and iterate with feedback |
| `/api/diff-view/:id` | GET | HTML diff viewer with approve/reject |
| `/api/screenshot/:id` | GET | Screenshot image |
| `/api/sandboxes` | GET | List active sandboxes |
| `/preview/:id/*` | GET | Live preview proxy with auth bypass |

## Documentation

- [Sandbox Architecture](./docs/SANDBOX_ARCHITECTURE.md)
- [Preview Bootstrap Contract](./docs/PREVIEW_BOOTSTRAP_CONTRACT.md)
- [Product Adapter Contract](./docs/PRODUCT_ADAPTER_CONTRACT.md)
- [Bootstrap Plan](./docs/BOOTSTRAP_PLAN.md)

## License

Internal use only — Moloco proprietary.

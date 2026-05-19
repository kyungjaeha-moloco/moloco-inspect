# DEPRECATED — see `design-system-mcp/` at repo root

This directory is an **older, unbuilt** copy of the Moloco Design System MCP server. It is no longer the active surface and is kept only until callers are migrated.

## Active server

The active MCP server lives at the repo root:

```
design-system-mcp/
```

- 9 tools registered (this dormant copy has 8 with an older shape).
- Builds to `dist/index.js`. Auto-registered via `.mcp.json` at repo root — any Claude Code session opened in the repo picks it up.

## Why this directory still exists

Historical: the MCP work originally started here, then was rebuilt at the repo root with a wider tool surface. The directory was kept while we confirmed no caller still pointed at this path. As of 2026-05-19 no Claude Code or Cursor config references it, and the active server's smoke test (9 tools, `search_components({query:"beta tag"})` returns MCBetaTag with relevance 31) covers all functionality this directory ever provided.

## Migration

If you previously pointed at this path:

- **Claude Code / Cursor `.mcp.json` / `mcp.json`**: change the `args` path from `design-system/mcp-server/...` to `design-system-mcp/dist/index.js`. See `design-system-mcp/README.md` for the canonical setup.
- **Scripts / docs**: search-and-replace `design-system/mcp-server` → `design-system-mcp`.

## Removal timing

This directory will be deleted once we have confirmed (via a clean smoke run plus team-trial usage) that no automation references it. Target: end of trial, late May 2026.

# Moloco Design System MCP Server

Exposes the Moloco Design System to AI coding assistants (Claude Code, Cursor, etc.) via the [Model Context Protocol](https://modelcontextprotocol.io/). Components, design tokens, patterns, and UX writing rules become queryable at planning and edit time.

## What this gives you

Once registered, AI agents can call these tools without re-typing component specs into prompts:

| Tool | What it returns |
|------|-----------------|
| `list_components` | All component names + short description + category. Optional category filter. |
| `get_component` | Full detail for one component: props, import path, when_to_use, do/don't, dependencies, recipe code, golden states, accessibility, structure, style. |
| `get_component_example` | Import statement + example snippet + recipe code. |
| `get_component_dependencies` | Provider / context requirements (requires, optional, must_be_inside, rendering recipe). |
| `get_token` | Design tokens by category (color / spacing / typography / borderRadius), optional role filter. |
| `get_pattern` | Pattern definition: layer structure + file checklist + validation checklist + code example. |
| `search_components` | Fuzzy search across names + descriptions, top 10 matches with relevance. |
| `get_component_states` | State machine: all states, transitions, Formik notes. |
| `get_ux_writing_rules` | UX writing principles + surface-specific rules (button, error, empty_state, tooltip, placeholder). |

## Quick setup

```bash
cd design-system-mcp
npm install
npm run build
```

This produces `dist/index.js`. The project-level `.mcp.json` already points at it — any Claude Code session opened in the repo root picks the server up automatically. No per-user config needed.

To run the server in dev mode (auto-reloads TypeScript via `tsx`):

```bash
npm run dev
```

## Manual registration (Cursor / other clients)

If your client does not auto-discover `.mcp.json`, register it explicitly. Example for Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "moloco-design-system": {
      "command": "node",
      "args": ["/absolute/path/to/moloco-inspect/design-system-mcp/dist/index.js"]
    }
  }
}
```

## Verifying it works

Run a minimal handshake against the built binary:

```bash
(printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'; sleep 1) \
  | node design-system-mcp/dist/index.js
```

Expected: an `initialize` response advertising 9 tools, followed by the `tools/list` result listing them.

## How it reads data

The server reads JSON files from `../design-system/src/` at startup:

- `components.json` — full component catalog (~500KB, ~112 components)
- `tokens.json` — design tokens
- `patterns.json` — composition patterns
- `component-behaviors.json`, `component-dependencies.json`, `state-machines.json`, `ux-writing.json`, `preview-verification.json`, etc.

`DESIGN.md` (the planner-time foundation brief) is **not** served by the MCP layer — that condensed view exists only for the Molly plan-emitter system block. MCP clients get the full machine-readable contract.

## Layout

```
design-system-mcp/
├── src/index.ts      — server entry + tool handlers
├── dist/             — compiled output (gitignored; run `npm run build`)
├── package.json
└── README.md         — you are here
```

## Related

- **Active MCP server**: this directory (`design-system-mcp/`). Used by `.mcp.json` at repo root.
- **Deprecated duplicate**: `design-system/mcp-server/` — older copy (SDK 1.12, 8 tools, no build). To be removed; see its README for migration notes.
- **Plan-time foundation brief** (different consumer): `design-system/src/DESIGN.md` + planner-side condensation. See `docs/superpowers/research/2026-05-18-design-md-condensation.md`.

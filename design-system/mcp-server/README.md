# MSM Portal Design System MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that exposes the MSM Portal design system to AI coding assistants (Claude Code, Cursor, etc.) without requiring them to read entire JSON files.

## Tools

| Tool | Description |
|------|-------------|
| `list_components` | All component names grouped by category |
| `get_component` | Full component definition — props, states, dos/donts, example |
| `list_tokens` | All token categories with descriptions |
| `get_tokens` | Tokens for a specific category (`color.text`, `color.background`, `color.border`, `color.icon`, `spacing`, `typography`) |
| `list_patterns` | All pattern IDs with descriptions |
| `get_pattern` | Full pattern with code example and rules |
| `get_conventions` | Naming prefixes, file structure, import rules, architecture |
| `get_icon_catalog` | Icon names grouped by category |

## Setup

### Claude Code (recommended)

```bash
claude mcp add msm-design-system -- npx ts-node design-system/mcp-server/src/index.ts
```

Or add manually to `.claude/settings.json` or your global MCP config:

```json
{
  "mcpServers": {
    "msm-design-system": {
      "command": "npx",
      "args": ["ts-node", "design-system/mcp-server/src/index.ts"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in the repo root:

```json
{
  "mcpServers": {
    "msm-design-system": {
      "command": "npx",
      "args": ["ts-node", "design-system/mcp-server/src/index.ts"]
    }
  }
}
```

## Development

```bash
cd design-system/mcp-server
npm install
npm start
```

## JSON Sources

The server reads from `design-system/src/`:

- `tokens.json` — colors, spacing, typography, icon catalog
- `components.json` — component props, states, examples
- `patterns.json` — composition patterns with code
- `conventions.json` — naming, file structure, architecture rules

# MSM Portal Design System

> AI-readable design system for the MSM Portal monorepo.
> **Source of truth**: `src/*.json` — edit these files only.
> **Generated docs**: `docs/*.md` — auto-generated, do not edit.
> **Moloco Inspect note**: this is the phase-1 design-system migration inside `moloco-inspect`; product sync still depends on the source workspace app code.

## Usage

```bash
# Generate markdown docs from JSON
node generate.mjs

# Validate JSON source files against schemas
npm run validate

# Check documentation ↔ codebase sync
npm run sync-check

# Generate CSS custom properties from tokens
npm run generate:css
```

## Structure

```
design-system/
├── src/               ← EDIT THESE (source of truth)
│   ├── tokens.json        Design tokens (colors, spacing, typography, breakpoints, animation, dark mode)
│   ├── components.json    Component API reference + icon catalog
│   ├── patterns.json      Composition patterns (17 patterns incl. edit-page)
│   └── conventions.json   Naming & code style conventions
├── schemas/           ← JSON Schema validation
│   ├── tokens.schema.json
│   ├── components.schema.json
│   ├── patterns.schema.json
│   └── conventions.schema.json
├── scripts/           ← Tooling
│   ├── validate-schemas.mjs     Schema validation
│   ├── sync-check.mjs           Codebase sync checker
│   └── generate-css-variables.mjs  CSS variable generator
├── dist/              ← AUTO-GENERATED CSS
│   ├── tokens.css         Full CSS custom properties (with -rgb twins)
│   └── tokens-rgb-only.css  RGB variants only
├── docs/              ← AUTO-GENERATED markdown (do not edit)
│   ├── tokens.md
│   ├── components.md
│   ├── patterns.md
│   └── conventions.md
├── mcp-server/        ← MCP server for AI coding assistants
│   ├── src/index.ts       Server implementation (8 tools)
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── generate.mjs       ← Markdown doc generator
├── index.html         ← Visual browser viewer
└── package.json
```

## For AI Agents

> **Start here:** [`GUIDE.md`](GUIDE.md) — 전체 구조, 파일 역할, 에이전트 워크플로우 설명

Read `src/*.json` for structured, precise data.
Read `docs/*.md` for human-friendly explanations with code examples.

| Question | Read this file |
|----------|---------------|
| What color/spacing/typography/breakpoint/animation token? | `src/tokens.json` |
| What component exists? What props? What icons? | `src/components.json` |
| How to compose for this page type? | `src/patterns.json` |
| Naming/file/import conventions? | `src/conventions.json` |
| Dark mode color mappings? | `src/tokens.json` → `darkMode` section |

### MCP Server (recommended)

Register the MCP server for direct tool-based queries instead of reading raw JSON:

```bash
claude mcp add msm-design-system -- npx ts-node design-system/mcp-server/src/index.ts
```

Available tools: `list_components`, `get_component`, `list_tokens`, `get_tokens`, `list_patterns`, `get_pattern`, `get_conventions`, `get_icon_catalog`

## Quick Reference

### Token access pattern
```tsx
props.theme.mcui.{palette|typography|spacing|fontFamily|breakpoints}.*
```

### CSS variable usage (from dist/tokens.css)
```css
/* Direct color */
color: var(--color-text-brand-default);

/* Color with opacity (using -rgb twin) */
background: rgba(var(--color-text-brand-default-rgb), 0.5);
```

### Naming prefixes
| Prefix | Meaning |
|--------|---------|
| `MC` | Component |
| `MT` | TypeScript type |
| `SC` | Styled component (internal) |
| `ME` | Enum |

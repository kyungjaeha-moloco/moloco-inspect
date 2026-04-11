# Domain Knowledge: Update Design System

## File Purposes

| File | What it documents |
|------|-------------------|
| `src/components.json` | Every reusable component: props, states, accessibility, usage examples |
| `src/tokens.json` | Design tokens: colors, spacing, typography, breakpoints, animation |
| `src/patterns.json` | Composition patterns: how components combine into features |
| `src/conventions.json` | Naming rules, file structure, import order, build commands |

Changes to these files are the authoritative source of truth for all agents building UI.
An undocumented component is invisible to agents — they will re-invent it or misuse it.

## components.json — Required Fields

Every component entry must satisfy this structure:

```json
{
  "name": "MCComponentName",
  "path": "form/v1/input/MCComponentName.tsx",
  "description": "One sentence describing the component's purpose.",
  "formikRequired": false,
  "props": [
    {
      "name": "propName",
      "type": "string",
      "required": true,
      "description": "What this prop controls."
    },
    {
      "name": "optionalProp",
      "type": "boolean",
      "required": false,
      "default": "false",
      "description": "What this prop controls when set."
    }
  ],
  "states": [
    { "name": "default",  "description": "Normal resting state." },
    { "name": "hover",    "description": "Mouse over the component." },
    { "name": "focus",    "description": "Keyboard focus via Tab." },
    { "name": "disabled", "description": "Cannot be interacted with." },
    { "name": "error",    "description": "Validation error state." }
  ],
  "accessibility": {
    "role": "button",
    "ariaLabel": "Provided via the label prop; falls back to aria-label.",
    "keyboardInteraction": [
      "Tab: Move focus to the component.",
      "Enter / Space: Trigger the primary action."
    ],
    "screenReaderAnnouncement": "Announces: {label}, button.",
    "notes": ["Any additional a11y implementation notes."]
  },
  "dos": [
    "Always provide a label prop for accessibility.",
    "Use the contained variant for the primary action on a page."
  ],
  "donts": [
    "Don't use more than one contained button per form.",
    "Don't hardcode onClick handlers — pass callbacks from the container."
  ],
  "example": "import MCComponentName from '@msm-portal/common/component/...';\n\n<MCComponentName\n  label=\"Save\"\n  onClick={handleSave}\n/>"
}
```

### Field Rules

- `name` — must match the exported TypeScript identifier exactly
- `path` — relative to `src/common/component/`; must be the actual file path
- `formikRequired` — `true` only if the component calls `useField(name)` internally
- `props[].type` — use TypeScript syntax: `string`, `boolean`, `ReactNode`, `'create' | 'edit'`
- `props[].required` — `true` means the component throws or misbehaves without it
- `props[].default` — include only when the component has a meaningful default
- `states[]` — include every interactive state the component renders differently
- `accessibility.role` — use the ARIA role string; `"implicit"` if HTML semantics are sufficient
- `example` — must be a complete, importable snippet; use `\n` for line breaks in JSON strings

## tokens.json — Required Fields

Color token entry:
```json
{
  "name": "content.primary",
  "token": "theme.mcui.palette.content.primary",
  "hex": "#1a1a1a",
  "usage": "Primary body text, headings, labels."
}
```

Spacing entry:
```json
{
  "multiplier": 2,
  "px": "16px",
  "usage": "Standard padding inside cards and panels.",
  "category": "component"
}
```

Typography entry:
```json
{
  "name": "BODY_1_BODY",
  "token": "theme.mcui.typography.BODY_1_BODY",
  "usage": "Standard body text, descriptions, form field values."
}
```

## patterns.json — Required Fields

```json
{
  "id": "kebab-case-id",
  "name": "Human Readable Pattern Name",
  "description": "One or two sentences on what this pattern achieves.",
  "when": "Plain language description of when to use this pattern.",
  "code": "// Complete, copy-pasteable code example\nimport { ... } from '...';\n\nexport default function Example() {\n  return <Component />;\n}"
}
```

- `id` — kebab-case, unique across all patterns
- `code` — the full example, not a fragment; must be runnable without modification
- `when` — start with an action word: "Building a...", "Creating a...", "When the user needs..."

## When to Add vs Update

**Add a new entry** when:
- A component that didn't exist before is now in the codebase
- A new composition pattern has been established by usage
- A new design token is in the theme

**Update an existing entry** when:
- A component's props changed (added, removed, or renamed)
- A component's accessibility implementation improved
- An existing pattern has a better code example
- A `donts[]` item is discovered from a real mistake

**Never** delete entries unless the component was removed from the codebase.
Deprecated components should be marked in `description` as deprecated, not removed.

## JSON Formatting Rules

- 2-space indentation throughout
- No trailing commas
- Strings use double quotes
- Arrays with 3+ items are multi-line, one item per line
- The `code` field uses `\n` for newlines and `\"` for quotes within the JSON string

## Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run validate` | Validate all `src/*.json` against their schemas |
| `npm run generate` | Regenerate `docs/*.md` from `src/*.json` |
| `npm run sync-check` | Verify component paths exist in the codebase |
| `npm run generate:css` | Generate `dist/tokens.css` with CSS variables |

Always run `validate` → `generate` → `sync-check` in that order after any change.

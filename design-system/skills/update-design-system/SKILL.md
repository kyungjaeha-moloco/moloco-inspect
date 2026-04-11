# Skill: Update Design System

**Purpose**: Add or update component documentation, tokens, or patterns in the design system source files.
**Read first**: `instruction.md` in this directory.

---

## Steps

### Step 1 — Identify what changed
Determine the scope of the update:
- New component added to the codebase → update `components.json`
- New design token introduced → update `tokens.json`
- New composition pattern identified → update `patterns.json`
- New naming or structural convention → update `conventions.json`
- Multiple files may need updating for a single feature

### Step 2 — Read the relevant schema
Read the schema file for the JSON you are about to modify:

| Target file | Schema |
|-------------|--------|
| `src/components.json` | `schemas/components.schema.json` |
| `src/tokens.json` | `schemas/tokens.schema.json` |
| `src/patterns.json` | `schemas/patterns.schema.json` |
| `src/conventions.json` | `schemas/conventions.schema.json` |

Understand all required fields before writing any JSON.

### Step 3 — Read the current source file
Read the full `src/*.json` file you are modifying.
Understand the existing structure, categories, and field conventions.
Find the correct location to insert the new entry (alphabetical within category, or logical grouping).

### Step 4 — Write the update
Add or modify the entry following the schema exactly.
See `instruction.md` for required fields per file type.

For `components.json` — new component entry must include:
- `name`, `path`, `description`, `formikRequired`
- `props[]` with all props fully documented
- `states[]` covering all interactive states
- `accessibility{}` with role, ariaLabel, keyboardInteraction, screenReaderAnnouncement
- `dos[]`, `donts[]`
- `example` — a complete, self-contained, copy-pasteable JSX snippet

For `tokens.json` — new token entry must include:
- `name`, `token` (full theme path), `hex`, `usage`

For `patterns.json` — new pattern entry must include:
- `id`, `name`, `description`, `when`, `code`

### Step 5 — Validate JSON syntax
Verify the file is valid JSON before running any scripts.
Check for: trailing commas, mismatched braces, unescaped characters in strings.

### Step 6 — Run schema validation
```bash
cd design-system
npm run validate
```
Fix any schema errors reported before proceeding.
All required fields must be present. No extra fields outside the schema.

### Step 7 — Regenerate docs
```bash
npm run generate
```
This regenerates all `docs/*.md` files from the updated `src/*.json` files.
Verify the generated doc reflects your changes correctly.

### Step 8 — Run sync check
```bash
npm run sync-check
```
This verifies that components listed in `components.json` actually exist at the declared `path` in the codebase.
Fix any path mismatches.

### Step 9 — Verify the example compiles
If you wrote or updated an `example` code snippet in `components.json` or `patterns.json`, manually verify it is syntactically valid TypeScript/JSX.
The example must be self-contained and runnable without modification.

### Step 10 — Confirm completeness
- [ ] Schema validation passes with zero errors
- [ ] Docs regenerated successfully
- [ ] Sync check passes
- [ ] Example snippet is valid and copy-pasteable
- [ ] No existing entries were accidentally modified

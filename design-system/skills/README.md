# Design System Agent Skills

This directory contains 2-tier skill definitions for AI agents working on the MSM Portal.
Each skill separates **workflow** (what to do) from **domain knowledge** (how to decide).

## Skill Index

| Skill | When to use | SKILL.md | instruction.md |
|-------|-------------|----------|----------------|
| `create-component/` | Creating a new reusable React component | Step-by-step file creation workflow | Naming, token usage, a11y rules |
| `create-form/` | Building a form page with Formik | Step-by-step form + container + route setup | Formik patterns, validation, error handling |
| `create-page/` | Building list / detail / create / edit pages | Step-by-step per page-type workflow | Page-Container-Component architecture |
| `review-component/` | Reviewing existing component code quality | Step-by-step checklist execution | 16-point validation rules, common mistakes |
| `update-design-system/` | Adding or updating design system documentation | Step-by-step JSON update + validation workflow | Schema requirements, field rules |

## How to Use

Each skill directory contains exactly two files:

- **`SKILL.md`** — The workflow layer. Follow these steps in order. Each step is atomic and verifiable.
- **`instruction.md`** — The domain knowledge layer. Read this to understand *how* to execute each step correctly.

## Tier Structure (inspired by Uber uSpec)

```
SKILL.md          → "What to do and in what order"
instruction.md    → "How to think and how to decide"
```

Always read `instruction.md` before starting a skill. The SKILL.md steps assume you have internalized the domain knowledge.

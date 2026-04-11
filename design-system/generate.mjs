#!/usr/bin/env node
/**
 * Design System Documentation Generator
 * Reads src/*.json → generates docs/*.md
 * Usage: node generate.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, 'src');
const DOCS = join(__dirname, 'docs');

mkdirSync(DOCS, { recursive: true });

const BANNER = (filename) =>
  `<!-- AUTO-GENERATED — Do not edit directly. Edit src/${filename}.json then run: node generate.mjs -->\n\n`;

// ─── TOKENS ───────────────────────────────────────────────────────────────────

function generateTokens() {
  const data = JSON.parse(readFileSync(join(SRC, 'tokens.json'), 'utf8'));
  let md = BANNER('tokens');
  md += `# Design Tokens\n\n`;
  md += `> ${data.meta.description}\n`;
  md += `> **Source**: \`${data.meta.source}\` | **Version**: ${data.meta.version}\n`;
  md += `> **Access pattern**: \`${data.meta.themeAccessPattern}\`\n\n---\n\n`;

  // Color System
  if (data.color) {
    md += `## Color System\n\n`;
    md += `${data.color.description}\n\n`;
    md += `**Naming**: \`${data.color.naming}\`\n\n`;
    md += `**Roles**: ${data.color.roles.map(r => `\`${r}\``).join(', ')}\n\n`;

    for (const [prop, group] of Object.entries(data.color)) {
      if (!group.tokens) continue;
      md += `### ${prop.charAt(0).toUpperCase() + prop.slice(1)}\n\n`;
      md += `${group.description}\n\n`;
      md += `| Name | Token | Hex | Role | Usage |\n|------|-------|-----|------|-------|\n`;
      for (const t of group.tokens) {
        const tokenPath = t.token || '—';
        const state = t.state ? ` (${t.state})` : '';
        md += `| \`${t.name}\` | \`${tokenPath}\` | \`${t.hex}\` | ${t.role}${state} | ${t.usage} |\n`;
      }
      md += `\n`;
    }
    md += `---\n\n`;
  }

  // Elevation
  if (data.elevation) {
    md += `## Elevation\n\n`;
    md += `${data.elevation.description}\n\n`;
    md += `${data.elevation.usage}\n\n`;
    md += `| Level | Surface | Shadow | Z-Index | Usage |\n|-------|---------|--------|---------|-------|\n`;
    for (const level of data.elevation.levels) {
      md += `| **${level.name}** | \`${level.surface}\` | \`${level.shadow}\` | ${level.zIndex} | ${level.usage} |\n`;
    }
    md += `\n---\n\n`;
  }

  // Spacing
  md += `## Spacing\n\n`;
  md += `${data.spacing.description} Base unit: **${data.spacing.baseUnit || 8}px**.\n\n`;
  md += `\`\`\`tsx\n${data.spacing.usage}\n${data.spacing.multiArgument}\n\`\`\`\n\n`;
  md += `| Call | Value | Category | Use Case |\n|------|-------|----------|----------|\n`;
  for (const v of data.spacing.values) {
    md += `| \`spacing(${v.multiplier})\` | ${v.px}px | ${v.category || '—'} | ${v.usage} |\n`;
  }
  md += `\n`;
  if (data.spacing.categories) {
    md += `### Spacing Categories\n\n`;
    md += `| Category | Range | Description |\n|----------|-------|-------------|\n`;
    for (const [cat, info] of Object.entries(data.spacing.categories)) {
      md += `| **${cat}** | ${info.range} | ${info.description} |\n`;
    }
    md += `\n`;
  }
  md += `---\n\n`;

  // Typography
  md += `## Typography\n\n`;
  md += `${data.typography.description}\n\n`;
  md += `\`\`\`tsx\n${data.typography.usage}\n\`\`\`\n\n`;

  // Group by category
  const headings = data.typography.tokens.filter(t => t.category === 'heading');
  const body = data.typography.tokens.filter(t => t.category === 'body');

  if (headings.length) {
    md += `### Headings\n\n`;
    md += `| Name | Size | Weight | Line Height | Usage |\n|------|------|--------|-------------|-------|\n`;
    for (const t of headings) {
      md += `| \`${t.name}\` | ${t.size} | ${t.weight} | ${t.lineHeight} | ${t.usage} |\n`;
    }
    md += `\n`;
  }
  if (body.length) {
    md += `### Body\n\n`;
    md += `| Name | Size | Weight | Line Height | Usage |\n|------|------|--------|-------------|-------|\n`;
    for (const t of body) {
      md += `| \`${t.name}\` | ${t.size} | ${t.weight} | ${t.lineHeight} | ${t.usage} |\n`;
    }
    md += `\n`;
  }

  if (data.typography.guidelines) {
    md += `### Guidelines\n\n`;
    if (data.typography.guidelines.accessibility) {
      md += `**Accessibility:**\n`;
      for (const rule of data.typography.guidelines.accessibility) md += `- ${rule}\n`;
      md += `\n`;
    }
    if (data.typography.guidelines.bestPractices) {
      md += `**Best Practices:**\n`;
      for (const rule of data.typography.guidelines.bestPractices) md += `- ${rule}\n`;
      md += `\n`;
    }
  }
  md += `---\n\n`;

  // Font family
  md += `## Font Family\n\n`;
  md += `\`${data.fontFamily.token}\` — ${data.fontFamily.usage}\n\n`;
  if (data.fontFamily.fallback) md += `**Fallback**: \`${data.fontFamily.fallback}\`\n\n`;
  md += `---\n\n`;

  // Border Radius
  md += `## Border Radius\n\n`;
  md += `${data.borderRadius.description}\n\n`;
  const brItems = data.borderRadius.tokens || data.borderRadius.values || [];
  md += `| Name | Value | Use Case |\n|------|-------|----------|\n`;
  for (const v of brItems) {
    md += `| \`${v.name || '—'}\` | \`${v.value}\` | ${v.usage} |\n`;
  }
  md += `\n---\n\n`;

  // Border Width
  if (data.borderWidth) {
    md += `## Border Width\n\n`;
    md += `${data.borderWidth.description}\n\n`;
    md += `| Name | Value | Use Case |\n|------|-------|----------|\n`;
    for (const v of data.borderWidth.tokens) {
      md += `| \`${v.name}\` | \`${v.value}\` | ${v.usage} |\n`;
    }
    md += `\n---\n\n`;
  }

  // Layout constants
  md += `## Layout Constants\n\n`;
  md += `${data.layoutConstants.description}\n\n`;
  md += `| Constant | Value | File |\n|----------|-------|------|\n`;
  for (const v of data.layoutConstants.values) {
    md += `| \`${v.name}\` | \`${v.value}\` | \`${v.file}\` |\n`;
  }
  md += `\n---\n\n`;

  // Breakpoints
  if (data.breakpoints) {
    md += `## Breakpoints\n\n`;
    md += `${data.breakpoints.description}\n\n`;
    md += `${data.breakpoints.usage}\n\n`;
    md += `| Name | Min Width | Description | Max Content Width |\n|------|-----------|-------------|-------------------|\n`;
    for (const bp of data.breakpoints.values) {
      md += `| \`${bp.name}\` | ${bp.value} | ${bp.description} | ${bp.maxContentWidth} |\n`;
    }
    md += `\n`;
    if (data.breakpoints.helpers?.example) {
      md += `### Example\n\n\`\`\`tsx\n${data.breakpoints.helpers.example}\n\`\`\`\n\n`;
    }
    if (data.breakpoints.guidelines) {
      md += `### Guidelines\n\n`;
      for (const g of data.breakpoints.guidelines) md += `- ${g}\n`;
      md += `\n`;
    }
    md += `---\n\n`;
  }

  // Animation
  if (data.animation) {
    md += `## Animation & Motion\n\n`;
    md += `${data.animation.description}\n\n`;

    md += `### Durations\n\n`;
    md += `| Name | Value | Usage |\n|------|-------|-------|\n`;
    for (const d of data.animation.durations) {
      md += `| \`${d.name}\` | ${d.value} | ${d.usage} |\n`;
    }
    md += `\n`;

    md += `### Easings\n\n`;
    md += `| Name | Value | Usage |\n|------|-------|-------|\n`;
    for (const e of data.animation.easings) {
      md += `| \`${e.name}\` | \`${e.value}\` | ${e.usage} |\n`;
    }
    md += `\n`;

    if (data.animation.patterns) {
      md += `### Common Patterns\n\n`;
      md += `| Pattern | CSS |\n|---------|-----|\n`;
      for (const [name, css] of Object.entries(data.animation.patterns)) {
        md += `| \`${name}\` | \`${css}\` |\n`;
      }
      md += `\n`;
    }

    if (data.animation.guidelines) {
      md += `### Guidelines\n\n`;
      for (const g of data.animation.guidelines) md += `- ${g}\n`;
      md += `\n`;
    }
    md += `---\n\n`;
  }

  // Dark Mode
  if (data.darkMode) {
    md += `## Dark Mode\n\n`;
    md += `${data.darkMode.description}\n\n`;
    if (data.darkMode.note) md += `> ${data.darkMode.note}\n\n`;
    md += `**Activation**: ${data.darkMode.activation}\n\n`;

    for (const [category, tokens] of Object.entries(data.darkMode.tokens)) {
      md += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      if (category === 'elevation') {
        md += `| Name | Light Surface | Dark Surface |\n|------|--------------|-------------|\n`;
        for (const t of tokens) {
          md += `| \`${t.name}\` | \`${t.lightSurface}\` | \`${t.darkSurface}\` |\n`;
        }
      } else {
        md += `| Name | Light | Dark |\n|------|-------|------|\n`;
        for (const t of tokens) {
          md += `| \`${t.name}\` | \`${t.light}\` | \`${t.dark}\` |\n`;
        }
      }
      md += `\n`;
    }
    md += `---\n\n`;
  }

  writeFileSync(join(DOCS, 'tokens.md'), md);
  console.log('✓ docs/tokens.md');
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function generateComponents() {
  const data = JSON.parse(readFileSync(join(SRC, 'components.json'), 'utf8'));
  let md = BANNER('components');
  md += `# Component Library\n\n`;
  md += `> ${data.meta.description}\n`;
  md += `> **Base path**: \`${data.meta.basePath}\`\n`;
  md += `> **Import alias**: \`${data.meta.importAlias}\`\n\n---\n\n`;

  for (const category of data.categories) {
    md += `## ${category.name}\n\n`;
    if (category.description) md += `${category.description}\n\n`;
    if (category.importPath) md += `**Import from**: \`${category.importPath}\`\n\n`;

    if (category.components) {
      for (const comp of category.components) {
        md += `### ${comp.name}\n\n`;
        if (comp.path) md += `**Path**: \`${comp.path}\`\n\n`;
        if (comp.description) md += `${comp.description}\n\n`;
        if (comp.formikRequired) md += `> Requires Formik context (\`useField(name)\`)\n\n`;
        if (comp.generic) md += `**Generic**: ${comp.generic}\n\n`;

        if (comp.props && comp.props.length > 0) {
          md += `| Prop | Type | Required | Default | Description |\n`;
          md += `|------|------|----------|---------|-------------|\n`;
          for (const p of comp.props) {
            const req = p.required ? '✓' : '';
            const def = p.default || '';
            md += `| \`${p.name}\` | \`${p.type}\` | ${req} | ${def} | ${p.description} |\n`;
          }
          md += `\n`;
        }

        if (comp.notes && comp.notes.length > 0) {
          for (const note of comp.notes) md += `- ${note}\n`;
          md += `\n`;
        }

        if (comp.types) {
          for (const [typeName, typeDef] of Object.entries(comp.types)) {
            md += `**\`${typeName}\`**: \`${typeDef}\`\n\n`;
          }
        }

        if (comp.layout) {
          md += `**Layout**: ${comp.layout}\n\n`;
        }

        if (comp.example) {
          md += `\`\`\`tsx\n${comp.example}\n\`\`\`\n\n`;
        }

        // States
        if (comp.states && comp.states.length > 0) {
          md += `**States:**\n\n`;
          md += `| State | Description |\n|-------|-------------|\n`;
          for (const s of comp.states) {
            md += `| \`${s.name}\` | ${s.description} |\n`;
          }
          md += `\n`;
        }

        // Variants
        if (comp.variants && comp.variants.length > 0) {
          md += `**Variants:**\n\n`;
          md += `| Variant | Description |\n|---------|-------------|\n`;
          for (const v of comp.variants) {
            const extra = v.usage ? ` ${v.usage}` : '';
            const color = v.color ? ` (\`${v.color}\`)` : '';
            md += `| \`${v.name}\`${color} | ${v.description}${extra} |\n`;
          }
          md += `\n`;
        }

        // Sizes
        if (comp.sizes && comp.sizes.length > 0) {
          md += `**Sizes:**\n\n`;
          md += `| Size | Description |\n|------|-------------|\n`;
          for (const s of comp.sizes) {
            md += `| \`${s.name}\` | ${s.description} |\n`;
          }
          md += `\n`;
        }

        // Dos
        if (comp.dos && comp.dos.length > 0) {
          md += `**Do:**\n`;
          for (const d of comp.dos) md += `- ✅ ${d}\n`;
          md += `\n`;
        }

        // Don'ts
        if (comp.donts && comp.donts.length > 0) {
          md += `**Don't:**\n`;
          for (const d of comp.donts) md += `- ❌ ${d}\n`;
          md += `\n`;
        }
      }
    }

    if (category.styledComponents) {
      md += `### Styled Components\n\n`;
      md += `| Component | Props | Description |\n|-----------|-------|-------------|\n`;
      for (const sc of category.styledComponents) {
        md += `| \`${sc.name}\` | ${sc.props || '—'} | ${sc.description} |\n`;
      }
      md += `\n`;

      // Styled component dos/donts
      for (const sc of category.styledComponents) {
        if (sc.dos || sc.donts) {
          md += `**${sc.name}:**\n`;
          if (sc.dos) for (const d of sc.dos) md += `- ✅ ${d}\n`;
          if (sc.donts) for (const d of sc.donts) md += `- ❌ ${d}\n`;
          md += `\n`;
        }
      }
    }

    if (category.enums) {
      for (const en of category.enums) {
        md += `### \`${en.name}\`\n\n`;
        md += `| Key | Value | CSS Value |\n|-----|-------|----------|\n`;
        for (const v of en.values) {
          md += `| \`${v.key}\` | \`'${v.value}'\` | \`${v.cssValue}\` |\n`;
        }
        md += `\n`;
      }
    }

    if (category.cellRenderers) {
      md += `### Cell Renderers\n\n`;
      md += `**Import from**: \`${category.cellRenderers.importPath}\`\n\n`;
      md += `| Function | Usage |\n|----------|-------|\n`;
      for (const fn of category.cellRenderers.functions) {
        md += `| \`${fn.name}\` | ${fn.usage} |\n`;
      }
      md += `\n`;
    }

    if (category.sortHandlers) {
      md += `### Sort Handlers\n\n`;
      md += `**Import from**: \`${category.sortHandlers.importPath}\`\n\n`;
      md += `| Function | Usage |\n|----------|-------|\n`;
      for (const fn of category.sortHandlers.functions) {
        md += `| \`${fn.name}\` | ${fn.usage} |\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;
  }

  writeFileSync(join(DOCS, 'components.md'), md);
  console.log('✓ docs/components.md');
}

// ─── PATTERNS ─────────────────────────────────────────────────────────────────

function generatePatterns() {
  const data = JSON.parse(readFileSync(join(SRC, 'patterns.json'), 'utf8'));
  let md = BANNER('patterns');
  md += `# Patterns\n\n> ${data.meta.description}\n\n---\n\n`;

  for (const pattern of data.patterns) {
    md += `## ${pattern.name}\n\n`;
    if (pattern.description) md += `${pattern.description}\n\n`;
    if (pattern.when) md += `**When to use**: ${pattern.when}\n\n`;

    if (pattern.rules) {
      md += `**Rules:**\n`;
      for (const rule of pattern.rules) md += `- ${rule}\n`;
      md += `\n`;
    }

    if (pattern.order) {
      md += `**Provider order:**\n`;
      for (const item of pattern.order) md += `1. ${item}\n`;
      md += `\n`;
    }

    if (pattern.code) {
      md += `\`\`\`tsx\n${pattern.code}\n\`\`\`\n\n`;
    }

    md += `---\n\n`;
  }

  writeFileSync(join(DOCS, 'patterns.md'), md);
  console.log('✓ docs/patterns.md');
}

// ─── CONVENTIONS ──────────────────────────────────────────────────────────────

function generateConventions() {
  const data = JSON.parse(readFileSync(join(SRC, 'conventions.json'), 'utf8'));
  let md = BANNER('conventions');
  md += `# Conventions\n\n> ${data.meta.description}\n\n---\n\n`;

  md += `## Naming Prefixes\n\n`;
  md += `| Prefix | Type | Description | Examples |\n|--------|------|-------------|----------|\n`;
  for (const p of data.namingPrefixes) {
    md += `| \`${p.prefix}\` | ${p.type} | ${p.description} | ${p.examples.map(e => `\`${e}\``).join(', ')} |\n`;
  }
  md += `\n---\n\n`;

  md += `## File Naming\n\n`;
  md += `| Pattern | Use Case | Examples |\n|---------|----------|----------|\n`;
  for (const f of data.fileNaming) {
    md += `| \`${f.pattern}\` | ${f.useCase} | ${f.examples.map(e => `\`${e}\``).join(', ')} |\n`;
  }
  md += `\n---\n\n`;

  md += `## Import Aliases\n\n`;
  md += `| Alias | Resolves To |\n|-------|-------------|\n`;
  for (const a of data.importAliases) {
    md += `| \`${a.alias}\` | \`${a.resolves}\` |\n`;
  }
  md += `\n---\n\n`;

  md += `## Import Order\n\n`;
  for (const item of data.importOrder) md += `${item}\n\n`;
  md += `---\n\n`;

  md += `## Styled Component Rules\n\n`;
  for (const rule of data.styledComponentRules) md += `- ${rule}\n`;
  md += `\n---\n\n`;

  md += `## Form Component Rules\n\n`;
  for (const rule of data.formComponentRules) md += `- ${rule}\n`;
  md += `\n---\n\n`;

  md += `## Directory Structure\n\n`;
  md += `**Component pattern**: \`${data.directoryStructure.componentPattern}\`\n\n`;
  md += `**Form pattern**: \`${data.directoryStructure.formPattern}\`\n\n`;
  md += `**App pattern**: \`${data.directoryStructure.appPattern}\`\n\n`;
  md += `---\n\n`;

  // Architecture (3-layer pattern)
  if (data.architecture) {
    md += `## Architecture\n\n`;
    md += `${data.architecture.description}\n\n`;
    md += `| Layer | Location | Naming | Responsibility |\n|-------|----------|--------|---------------|\n`;
    for (const layer of data.architecture.layers) {
      md += `| **${layer.name}** | \`${layer.location}\` | \`${layer.naming}\` | ${layer.responsibility} |\n`;
    }
    md += `\n---\n\n`;
  }

  // Container naming
  if (data.containerNaming) {
    md += `## Container Naming\n\n`;
    md += `**Pattern**: \`${data.containerNaming.pattern}\`\n\n`;
    md += `**Actions**: ${data.containerNaming.actions.join(', ')}\n\n`;
    md += `**Examples**: ${data.containerNaming.examples.map(e => `\`${e}\``).join(', ')}\n\n`;
    md += `---\n\n`;
  }

  md += `## Build Commands\n\n`;
  md += `\`\`\`bash\n`;
  for (const [k, v] of Object.entries(data.buildCommands)) {
    md += `# ${k}\n${v}\n\n`;
  }
  md += `\`\`\`\n\n---\n\n`;

  md += `## Environment Variables\n\n`;
  md += `- **Prefix**: \`${data.envVars.prefix}\`\n`;
  md += `- **Access**: \`${data.envVars.access}\`\n`;
  md += `- **Files**: ${data.envVars.files.map(f => `\`${f}\``).join(', ')}\n`;
  md += `- ${data.envVars.note}\n\n---\n\n`;

  md += `## Supported Clients\n\n`;
  for (const c of data.clients) md += `- \`${c}\`\n`;

  writeFileSync(join(DOCS, 'conventions.md'), md);
  console.log('✓ docs/conventions.md');
}

// ─── UX WRITING ───────────────────────────────────────────────────────────────

function generateUxWriting() {
  const data = JSON.parse(readFileSync(join(SRC, 'ux-writing.json'), 'utf8'));
  let md = BANNER('ux-writing');
  md += `# UX Writing\n\n`;
  md += `> ${data.meta.description}\n`;
  md += `> **Version**: ${data.meta.version}\n\n---\n\n`;

  md += `## Service Voice\n\n`;
  for (const principle of data.service_voice.principles) {
    md += `### ${principle.name}\n\n`;
    md += `${principle.rule}\n\n`;
    if (principle.good_examples) {
      md += `**Good examples**\n\n`;
      for (const [locale, examples] of Object.entries(principle.good_examples)) {
        md += `- ${locale}: ${examples.map((item) => `\`${item}\``).join(', ')}\n`;
      }
      md += `\n`;
    }
    if (principle.avoid) {
      md += `**Avoid**\n\n`;
      for (const [locale, examples] of Object.entries(principle.avoid)) {
        md += `- ${locale}: ${examples.map((item) => `\`${item}\``).join(', ')}\n`;
      }
      md += `\n`;
    }
  }

  md += `## Terminology\n\n`;
  md += `| Concept | Korean | English |\n|---------|--------|---------|\n`;
  for (const term of data.service_voice.terminology.recommended) {
    md += `| ${term.concept} | ${term.ko} | ${term.en} |\n`;
  }
  md += `\n${data.service_voice.terminology.consistency_rule}\n\n---\n\n`;

  md += `## Surface Rules\n\n`;
  for (const [surface, rules] of Object.entries(data.surface_rules)) {
    md += `### ${surface}\n\n`;
    md += `${rules.rule}\n\n`;
    if (rules.guidance) {
      for (const item of rules.guidance) md += `- ${item}\n`;
      md += `\n`;
    }
    if (rules.do) {
      md += `**Do**\n\n`;
      for (const [locale, examples] of Object.entries(rules.do)) {
        md += `- ${locale}: ${examples.map((item) => `\`${item}\``).join(', ')}\n`;
      }
      md += `\n`;
    }
    if (rules.dont) {
      md += `**Don't**\n\n`;
      for (const [locale, examples] of Object.entries(rules.dont)) {
        md += `- ${locale}: ${examples.map((item) => `\`${item}\``).join(', ')}\n`;
      }
      md += `\n`;
    }
    if (rules.examples) {
      md += `**Examples**\n\n`;
      for (const [locale, values] of Object.entries(rules.examples)) {
        if (typeof values !== 'object' || values === null) continue;
        md += `- ${locale}\n`;
        for (const [kind, examples] of Object.entries(values)) {
          md += `  - ${kind}: ${examples.map((item) => `\`${item}\``).join(', ')}\n`;
        }
      }
      md += `\n`;
    }
  }

  md += `## Writing Process\n\n`;
  md += `### Authoring Steps\n\n`;
  for (const step of data.writing_process.authoring_steps) md += `- ${step}\n`;
  md += `\n### Review Questions\n\n`;
  for (const question of data.writing_process.review_questions) md += `- ${question}\n`;
  md += `\n---\n\n`;

  md += `## Validation Process\n\n`;
  md += `**Automation policy**: ${data.validation_process.automation_policy.rationale}\n\n`;
  md += `### Automated Checks\n\n`;
  for (const check of data.validation_process.automated_checks) {
    md += `- **${check.id}**: ${check.description}\n`;
  }
  md += `\n### Manual Review\n\n`;
  for (const item of data.validation_process.manual_review) md += `- ${item}\n`;
  md += `\n---\n\n`;

  md += `## Machine Checks\n\n`;
  md += `### Discouraged Phrases\n\n`;
  md += `| ID | Locale | Match | Value | Severity |\n|----|--------|-------|-------|----------|\n`;
  for (const rule of data.machine_checks.discouraged_phrases) {
    md += `| \`${rule.id}\` | ${rule.locale} | ${rule.match_type} | \`${rule.value}\` | ${rule.severity} |\n`;
  }
  md += `\n### Generic CTA Rules\n\n`;
  md += `| ID | Locale | Key Suffixes | Exact Values | Severity |\n|----|--------|-------------|-------------|----------|\n`;
  for (const rule of data.machine_checks.generic_cta_rules) {
    md += `| \`${rule.id}\` | ${rule.locale} | ${rule.key_suffixes.map((item) => `\`${item}\``).join(', ')} | ${rule.exact_values.map((item) => `\`${item}\``).join(', ')} | ${rule.severity} |\n`;
  }
  md += `\n---\n\n`;

  md += `## Examples\n\n`;
  for (const [section, examples] of Object.entries(data.examples)) {
    md += `### ${section}\n\n`;
    for (const example of examples) {
      md += `**${example.scenario}**\n\n`;
      md += `- Before: ko \`${example.before.ko}\` / en \`${example.before.en}\`\n`;
      md += `- After: ko \`${example.after.ko}\` / en \`${example.after.en}\`\n`;
      md += `- Why: ${example.why}\n\n`;
    }
  }

  writeFileSync(join(DOCS, 'ux-writing.md'), md);
  console.log('✓ docs/ux-writing.md');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

console.log('Generating design system documentation...\n');
generateTokens();
generateComponents();
generatePatterns();
generateConventions();
generateUxWriting();
console.log('\nDone. Output in docs/');
console.log('\n📖 Open index.html in a browser to view the design system.');

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Utility ─────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function isHex(value) {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

/** Convert a token name like "text.neutral.default" → "color-text-neutral-default" */
function colorVarName(name) {
  return `--color-${name.replace(/\./g, '-')}`;
}

// ─── Load tokens ─────────────────────────────────────────────────────────────

const tokens = JSON.parse(readFileSync(join(ROOT, 'src/tokens.json'), 'utf8'));

// ─── Generators ──────────────────────────────────────────────────────────────

function generateColorBlock() {
  const lines = [];
  const categories = ['text', 'background', 'border', 'icon'];

  for (const category of categories) {
    const section = tokens.color[category];
    if (!section?.tokens) continue;

    lines.push(`  /* ${section.description} */`);
    for (const t of section.tokens) {
      if (!isHex(t.hex)) continue;
      const varName = colorVarName(t.name);
      lines.push(`  ${varName}: ${t.hex};`);
      lines.push(`  ${varName}-rgb: ${hexToRgb(t.hex)};`);
    }
    lines.push('');
  }

  return `:root {\n${lines.join('\n')}}`;
}

function generateRgbOnlyBlock() {
  const lines = [];
  const categories = ['text', 'background', 'border', 'icon'];

  for (const category of categories) {
    const section = tokens.color[category];
    if (!section?.tokens) continue;

    lines.push(`  /* ${section.description} */`);
    for (const t of section.tokens) {
      if (!isHex(t.hex)) continue;
      lines.push(`  ${colorVarName(t.name)}-rgb: ${hexToRgb(t.hex)};`);
    }
    lines.push('');
  }

  return `:root {\n${lines.join('\n')}}`;
}

function generateSpacingBlock() {
  const lines = ['  /* Spacing — base unit: 8px */'];
  for (const v of tokens.spacing.values) {
    const key = String(v.multiplier).replace('.', '-');
    lines.push(`  --spacing-${key}: ${v.px}px;`);
  }
  return `:root {\n${lines.join('\n')}\n}`;
}

function generateTypographyBlock() {
  const lines = ['  /* Typography scale */'];
  for (const t of tokens.typography.tokens) {
    const key = t.name.toLowerCase().replace(/_/g, '-');
    lines.push(`  --typography-${key}-size: ${t.size};`);
    lines.push(`  --typography-${key}-weight: ${t.weight};`);
    lines.push(`  --typography-${key}-line-height: ${t.lineHeight};`);
  }
  return `:root {\n${lines.join('\n')}\n}`;
}

function generateBorderRadiusBlock() {
  const lines = ['  /* Border radius */'];
  for (const t of tokens.borderRadius.tokens) {
    // "radius.small" → "--radius-small"
    const key = t.name.replace(/\./g, '-');
    lines.push(`  --${key}: ${t.value};`);
  }
  return `:root {\n${lines.join('\n')}\n}`;
}

function generateElevationBlock() {
  const lines = ['  /* Elevation shadows */'];
  for (const level of tokens.elevation.levels) {
    const key = `--elevation-${level.name}`;
    if (isHex(level.surface)) {
      lines.push(`  ${key}-surface: ${level.surface};`);
      if (isHex(level.surface)) {
        lines.push(`  ${key}-surface-rgb: ${hexToRgb(level.surface)};`);
      }
    }
    if (level.shadow && level.shadow !== 'none') {
      lines.push(`  ${key}-shadow: ${level.shadow};`);
    } else {
      lines.push(`  ${key}-shadow: none;`);
    }
  }
  return `:root {\n${lines.join('\n')}\n}`;
}

function generateAnimationBlock() {
  const lines = ['  /* Animation durations */'];
  for (const d of tokens.animation.durations) {
    const key = d.name.replace(/\./g, '-');
    lines.push(`  --${key}: ${d.value};`);
  }
  lines.push('');
  lines.push('  /* Animation easings */');
  for (const e of tokens.animation.easings) {
    const key = e.name.replace(/\./g, '-');
    lines.push(`  --${key}: ${e.value};`);
  }
  return `:root {\n${lines.join('\n')}\n}`;
}

function generateBreakpointsBlock() {
  const lines = ['  /* Breakpoints */'];
  for (const bp of tokens.breakpoints.values) {
    lines.push(`  --breakpoint-${bp.name}: ${bp.value};`);
  }
  return `:root {\n${lines.join('\n')}\n}`;
}

function generateDarkModeBlock() {
  const lines = [];
  const dm = tokens.darkMode.tokens;
  const categories = ['text', 'background', 'border', 'icon'];

  for (const category of categories) {
    const list = dm[category];
    if (!list) continue;

    lines.push(`  /* dark: ${category} */`);
    for (const t of list) {
      if (!isHex(t.dark)) continue;
      const varName = colorVarName(t.name);
      lines.push(`  ${varName}: ${t.dark};`);
      lines.push(`  ${varName}-rgb: ${hexToRgb(t.dark)};`);
    }
    lines.push('');
  }

  // Dark elevation surfaces
  lines.push('  /* dark: elevation */');
  for (const level of dm.elevation) {
    const key = `--elevation-${level.name}`;
    if (isHex(level.darkSurface)) {
      lines.push(`  ${key}-surface: ${level.darkSurface};`);
      lines.push(`  ${key}-surface-rgb: ${hexToRgb(level.darkSurface)};`);
    }
    if (level.darkShadow) {
      lines.push(`  ${key}-shadow: ${level.darkShadow};`);
    }
  }

  return `html[data-theme='dark'] {\n${lines.join('\n')}\n}`;
}

// ─── Assemble files ──────────────────────────────────────────────────────────

const HEADER = `/* MSM Portal Design Tokens — Auto-generated from tokens.json */
/* Usage: rgba(var(--color-text-brand-default-rgb), 0.5) */
/* Do not edit manually. Run: node scripts/generate-css-variables.mjs */
`;

const fullCss = [
  HEADER,
  '/* ── Colors ──────────────────────────────────────────── */',
  generateColorBlock(),
  '',
  '/* ── Spacing ─────────────────────────────────────────── */',
  generateSpacingBlock(),
  '',
  '/* ── Typography ──────────────────────────────────────── */',
  generateTypographyBlock(),
  '',
  '/* ── Border Radius ───────────────────────────────────── */',
  generateBorderRadiusBlock(),
  '',
  '/* ── Elevation ───────────────────────────────────────── */',
  generateElevationBlock(),
  '',
  '/* ── Animation ───────────────────────────────────────── */',
  generateAnimationBlock(),
  '',
  '/* ── Breakpoints ─────────────────────────────────────── */',
  generateBreakpointsBlock(),
  '',
  '/* ── Dark Mode ───────────────────────────────────────── */',
  generateDarkModeBlock(),
  '',
].join('\n');

const rgbOnlyCss = [
  HEADER,
  '/* RGB twin variants only — for projects extending existing CSS variable sets */',
  '',
  generateRgbOnlyBlock(),
  '',
].join('\n');

// ─── Write output ─────────────────────────────────────────────────────────────

const distDir = join(ROOT, 'dist');
mkdirSync(distDir, { recursive: true });

writeFileSync(join(distDir, 'tokens.css'), fullCss, 'utf8');
writeFileSync(join(distDir, 'tokens-rgb-only.css'), rgbOnlyCss, 'utf8');

console.log('Generated: dist/tokens.css');
console.log('Generated: dist/tokens-rgb-only.css');

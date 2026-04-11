#!/usr/bin/env node
/**
 * Prop Documentation Check
 * Two-tier extraction: parse TSX source files, compare against components.json.
 *
 * Tier 1 (deterministic): regex-based prop extraction from TSX type/interface blocks
 * Tier 2 (comparison): diff extracted props against documented props in components.json
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const DESIGN_SYSTEM_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(DESIGN_SYSTEM_DIR, '..');
const COMPONENTS_JSON = join(DESIGN_SYSTEM_DIR, 'src', 'components.json');
const CODEBASE_BASE = join(REPO_ROOT, 'msm-portal', 'js', 'msm-portal-web', 'src', 'common', 'component');

// ─── Load components.json ────────────────────────────────────────────────────

let componentsData;
try {
  componentsData = JSON.parse(readFileSync(COMPONENTS_JSON, 'utf8'));
} catch (err) {
  console.error(`Failed to read components.json: ${err.message}`);
  process.exit(2);
}

// ─── Prop extraction (Tier 1 — deterministic regex) ──────────────────────────

/**
 * Extract props from a TSX/TS source file content.
 * Looks for the first type/interface block whose name ends with "Props".
 *
 * Handles:
 *   type MTFooProps = { name: string; bar?: number }
 *   interface MTFooProps { name: string; bar?: number }
 *
 * Does NOT handle deeply nested generics or multi-level braces perfectly,
 * but covers the common flat-object pattern used in this codebase.
 */
function extractPropsFromSource(content) {
  const props = [];

  // Match the first Props type/interface block. The `s` flag lets `.` match newlines.
  // Allow for nested single-level braces (e.g. union types with object shapes).
  const typeMatch = content.match(
    /(?:type|interface)\s+\w*Props\w*\s*=?\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s,
  );
  if (!typeMatch) return props;

  const block = typeMatch[1];

  // Each prop line looks like:  propName?: SomeType;
  // We capture: name, optional marker, type (rest of the value before ; or end-of-line)
  const propRegex = /\b(\w+)(\?)?\s*:\s*([^;\n]+)/g;
  let match;
  while ((match = propRegex.exec(block)) !== null) {
    const name = match[1];
    // Skip TypeScript keywords that can appear inside type blocks
    if (['extends', 'implements', 'keyof', 'typeof', 'infer'].includes(name)) continue;
    props.push({
      name,
      required: !match[2],
      type: match[3].trim().replace(/,$/, ''), // strip trailing comma (interface style)
    });
  }

  return props;
}

/**
 * Detect whether the file uses useField (Formik integration).
 */
function detectFormikUsage(content) {
  return /useField\s*\(/.test(content);
}

// ─── Collect documented components ───────────────────────────────────────────

const documented = []; // { name, path, isExternal, docProps: string[] }

for (const category of componentsData.categories ?? []) {
  for (const comp of category.components ?? []) {
    const name = comp.name;
    if (!name) continue;

    const path = comp.path ?? null;
    if (!path) continue;

    const isExternal = path.startsWith('@');
    const docProps = Array.isArray(comp.props)
      ? comp.props.map((p) => p.name).filter(Boolean)
      : [];

    documented.push({ name, path, isExternal, docProps });
  }
}

// ─── Check codebase availability ─────────────────────────────────────────────

const codebaseExists = existsSync(CODEBASE_BASE);

if (!codebaseExists) {
  console.log('\n=== Prop Documentation Check ===\n');
  console.log(`  Codebase not found at: ${CODEBASE_BASE}`);
  console.log('  Cannot verify props. Ensure msm-portal/ is checked out alongside design-system/.');
  console.log('\n=== Summary ===\n');
  console.log('Codebase not found — prop check skipped.');
  console.log();
  process.exit(0);
}

// ─── Run two-tier check ───────────────────────────────────────────────────────

const counters = {
  checked: 0,
  matched: 0,
  undocumented: 0, // in source, not in docs
  extraInDocs: 0,  // in docs, not in source
  fileNotFound: 0,
  external: 0,
};

console.log('\n=== Prop Documentation Check ===\n');

for (const comp of documented) {
  if (comp.isExternal) {
    counters.external++;
    console.log(`\u229a ${comp.name} (@moloco/moloco-cloud-react-ui)`);
    console.log('    \u2298 EXTERNAL \u2014 skipped\n');
    continue;
  }

  const fullPath = join(CODEBASE_BASE, comp.path);
  console.log(`\u2500\u2500 ${comp.name} (${comp.path}) \u2500\u2500`);

  if (!existsSync(fullPath)) {
    counters.fileNotFound++;
    console.log('  \u2717 FILE NOT FOUND \u2014 cannot verify\n');
    continue;
  }

  counters.checked++;

  let content;
  try {
    content = readFileSync(fullPath, 'utf8');
  } catch (err) {
    console.log(`  \u2717 READ ERROR \u2014 ${err.message}\n`);
    counters.fileNotFound++;
    continue;
  }

  const sourceProps = extractPropsFromSource(content);
  const usesFormik = detectFormikUsage(content);

  if (usesFormik) {
    console.log('  (Formik: useField detected)');
  }

  const sourcePropNames = new Set(sourceProps.map((p) => p.name));
  const docPropNames = new Set(comp.docProps);

  // Props present in source
  for (const sp of sourceProps) {
    if (docPropNames.has(sp.name)) {
      counters.matched++;
      const typeHint = sp.type ? ` (${sp.type})` : '';
      console.log(`  \u2713 ${sp.name}${typeHint} \u2014 matched`);
    } else {
      counters.undocumented++;
      const typeHint = sp.type ? ` (${sp.type})` : '';
      console.log(`  \u26a0 ${sp.name}${typeHint} \u2014 in source, not in docs`);
    }
  }

  // Props in docs but not in source
  for (const dp of comp.docProps) {
    if (!sourcePropNames.has(dp)) {
      counters.extraInDocs++;
      console.log(`  \u2717 ${dp} \u2014 in docs, not in source`);
    }
  }

  // No props found at all in source
  if (sourceProps.length === 0) {
    console.log('  (no Props type/interface found in source — manual review needed)');
  }

  console.log();
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('=== Summary ===\n');
console.log(`Components checked:   ${counters.checked}`);
console.log(`Props matched:        ${counters.matched}`);
console.log(`Undocumented props:   ${counters.undocumented}`);
console.log(`Extra in docs:        ${counters.extraInDocs}`);
console.log(`Files not found:      ${counters.fileNotFound}`);
console.log(`External (skipped):   ${counters.external}`);
console.log();

// ─── Exit code ────────────────────────────────────────────────────────────────

if (counters.undocumented > 0 || counters.extraInDocs > 0) {
  process.exit(1);
}

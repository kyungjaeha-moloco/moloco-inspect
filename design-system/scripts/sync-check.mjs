#!/usr/bin/env node
/**
 * Design System Sync Check
 * Compares components.json documentation against the actual codebase.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

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

// ─── Collect documented components ───────────────────────────────────────────

const documented = []; // { name, path, isExternal, hasProps }

for (const category of componentsData.categories ?? []) {
  // Skip "pattern" entries at the category level (none here, but guard anyway)
  for (const comp of category.components ?? []) {
    const name = comp.name;
    if (!name) continue;

    const path = comp.path ?? null;
    const hasProps = Array.isArray(comp.props) && comp.props.length > 0;

    if (!path) {
      // No path at all — skip (styled-components entries, moloco primitives without path)
      continue;
    }

    const isExternal = path.startsWith('@');

    documented.push({ name, path, isExternal, hasProps });
  }
}

// ─── Check each documented component ─────────────────────────────────────────

const codebaseExists = existsSync(CODEBASE_BASE);

const results = {
  found: [],
  missing: [],
  external: [],
  stub: [],
};

console.log('\n=== Design System Sync Check ===\n');

if (!codebaseExists) {
  console.log(`  (codebase directory not found: ${CODEBASE_BASE})\n`);
}

for (const comp of documented) {
  if (comp.isExternal) {
    results.external.push(comp);
    console.log(`\u2296 ${comp.name} \u2014 ${comp.path} (EXTERNAL)`);
    continue;
  }

  if (!comp.hasProps) {
    results.stub.push(comp);
  }

  if (!codebaseExists) {
    // Can't check — treat as missing
    results.missing.push(comp);
    console.log(`\u2717 ${comp.name} \u2014 ${comp.path} (MISSING)`);
    continue;
  }

  const fullPath = join(CODEBASE_BASE, comp.path);

  // path may point to a file or a directory (e.g. "loader/", "stepper/")
  if (existsSync(fullPath)) {
    results.found.push(comp);
    console.log(`\u2713 ${comp.name} \u2014 ${comp.path}`);
  } else {
    results.missing.push(comp);
    console.log(`\u2717 ${comp.name} \u2014 ${comp.path} (MISSING)`);
  }
}

// ─── Scan codebase for undocumented MC* components ────────────────────────────

console.log('\n=== Undocumented Components ===\n');

const documentedPaths = new Set(documented.filter(c => !c.isExternal).map(c => c.path));

const undocumented = [];

if (!codebaseExists) {
  console.log('  (codebase directory not found — skipping scan)\n');
} else {
  // Recursively collect all .tsx / .ts files whose basename starts with MC
  function collectMCFiles(dir) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        collectMCFiles(fullPath);
      } else if (
        (entry.endsWith('.tsx') || entry.endsWith('.ts')) &&
        /^MC[A-Z]/.test(entry) &&
        !entry.includes('.stories.') &&
        !entry.includes('StyledComponents')
      ) {
        const relPath = relative(CODEBASE_BASE, fullPath);
        // Check if this file (or its parent dir path) is already documented
        const isDirect = documentedPaths.has(relPath);
        // Also check if a parent directory path covers it (e.g. "loader/" covers "loader/MCLoader.tsx")
        const isCoveredByDir = [...documentedPaths].some(p => p.endsWith('/') && relPath.startsWith(p));
        if (!isDirect && !isCoveredByDir) {
          undocumented.push(relPath);
        }
      }
    }
  }

  collectMCFiles(CODEBASE_BASE);

  if (undocumented.length === 0) {
    console.log('  (none)\n');
  } else {
    for (const relPath of undocumented) {
      console.log(`? ${relPath.split('/').pop()?.replace(/\.tsx?$/, '')} \u2014 found at ${relPath} (NOT IN DOCS)`);
    }
    console.log();
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('=== Summary ===\n');
console.log(
  `Documented: ${documented.length} | Found: ${results.found.length} | Missing: ${results.missing.length} | External: ${results.external.length} | Stub (no props): ${results.stub.length} | Undocumented: ${undocumented.length}`
);
console.log();

// ─── Exit code ────────────────────────────────────────────────────────────────

if (results.missing.length > 0 || undocumented.length > 0) {
  process.exit(1);
}

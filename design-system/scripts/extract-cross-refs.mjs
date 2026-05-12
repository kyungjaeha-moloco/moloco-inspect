#!/usr/bin/env node
/**
 * Ontology Phase 0 — Cross-ref extractor.
 *
 * For each component in components.json, derive three cross-ref fields:
 *   - usedInPatterns:     pattern ids in patterns.json whose code references the component
 *   - requiredProviders:  copied from component-dependencies.json `components.{name}.requires`
 *   - relatedComponents:  union of compositions.commonly_paired_with + same-folder siblings
 *                         + any existing relatedComponents (preserves manual additions)
 *
 * Re-writes components.json in place. Idempotent.
 *
 * Plan: docs/superpowers/plans/2026-05-12-ontology-evolution.md (Phase 0)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const DS_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(DS_DIR, '..');
const COMPONENTS_JSON = join(DS_DIR, 'src', 'components.json');
const PATTERNS_JSON = join(DS_DIR, 'src', 'patterns.json');
const DEPS_JSON = join(DS_DIR, 'src', 'component-dependencies.json');

// Optional Agent-Design-System workspace — when present, we enrich the
// extraction with codebase-derived signal (real usage counts + import-based
// provider backfill). Missing workspace gracefully skips that stage.
const SOURCE_WORKSPACE = resolve(REPO_ROOT, '..', 'Agent-Design-System');
const CODEBASE_SRC = join(SOURCE_WORKSPACE, 'msm-portal', 'js', 'msm-portal-web', 'src');
const CODEBASE_COMPONENT_BASE = join(CODEBASE_SRC, 'common', 'component');

for (const p of [COMPONENTS_JSON, PATTERNS_JSON, DEPS_JSON]) {
  if (!existsSync(p)) {
    console.error(`Not found: ${p}`);
    process.exit(2);
  }
}

const components = JSON.parse(readFileSync(COMPONENTS_JSON, 'utf8'));
const patterns = JSON.parse(readFileSync(PATTERNS_JSON, 'utf8'));
const deps = JSON.parse(readFileSync(DEPS_JSON, 'utf8'));

// ─── Step 1. Build patternsByComponent map ──────────────────────────────────
// For each pattern, scan its `code` (and `imports` arrays in layer_structure)
// for MC* component identifiers; record reverse map.

const MC_TOKEN = /\bMC[A-Z]\w*/g;
const patternsByComponent = new Map(); // name -> Set<patternId>

function collectStringsFromPattern(p) {
  const buf = [];
  if (typeof p.code === 'string') buf.push(p.code);
  // layer_structure.{page,container,component}.imports is an array of strings
  const ls = p.layer_structure;
  if (ls && typeof ls === 'object') {
    for (const layer of Object.values(ls)) {
      if (layer && Array.isArray(layer.imports)) buf.push(...layer.imports);
    }
  }
  // file_checklist and validation_checklist are sometimes referenced too
  if (Array.isArray(p.validation_checklist)) buf.push(...p.validation_checklist);
  return buf;
}

for (const p of patterns.patterns ?? []) {
  const blobs = collectStringsFromPattern(p);
  const seen = new Set();
  for (const blob of blobs) {
    const matches = blob.match(MC_TOKEN);
    if (!matches) continue;
    for (const name of matches) seen.add(name);
  }
  for (const name of seen) {
    if (!patternsByComponent.has(name)) patternsByComponent.set(name, new Set());
    patternsByComponent.get(name).add(p.id);
  }
}

// ─── Step 2. Build same-folder siblings ─────────────────────────────────────

const folderByComponent = new Map(); // name -> folder
const componentsByFolder = new Map(); // folder -> Set<name>
for (const cat of components.categories ?? []) {
  for (const c of cat.components ?? []) {
    if (!c.name || !c.path) continue;
    const folder = dirname(c.path);
    folderByComponent.set(c.name, folder);
    if (!componentsByFolder.has(folder)) componentsByFolder.set(folder, new Set());
    componentsByFolder.get(folder).add(c.name);
  }
}

// ─── Step 3. Mutate components.json ─────────────────────────────────────────

const stats = {
  total: 0,
  withPatterns: 0,
  withProviders: 0,
  withRelated: 0,
};

function uniqSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

for (const cat of components.categories ?? []) {
  for (const c of cat.components ?? []) {
    if (!c.name) continue;
    stats.total++;

    // usedInPatterns
    const patternSet = patternsByComponent.get(c.name);
    const usedInPatterns = patternSet ? Array.from(patternSet).sort() : [];

    // requiredProviders — from component-dependencies.json
    const depEntry = deps.components?.[c.name];
    const requiredProviders = Array.isArray(depEntry?.requires)
      ? [...depEntry.requires].sort()
      : [];

    // relatedComponents — union(existing, commonly_paired_with, same-folder siblings)
    const existing = Array.isArray(c.relatedComponents) ? c.relatedComponents : [];
    const paired = Array.isArray(c.compositions?.commonly_paired_with)
      ? c.compositions.commonly_paired_with
      : [];
    const folder = folderByComponent.get(c.name);
    const siblings = folder
      ? Array.from(componentsByFolder.get(folder) ?? []).filter((n) => n !== c.name)
      : [];
    const relatedComponents = uniqSorted([...existing, ...paired, ...siblings]);

    c.usedInPatterns = usedInPatterns;
    c.relatedComponents = relatedComponents;
    c.requiredProviders = requiredProviders;

    if (usedInPatterns.length) stats.withPatterns++;
    if (requiredProviders.length) stats.withProviders++;
    if (relatedComponents.length) stats.withRelated++;
  }
}

// ─── Stage A — codebase usage scan (optional) ─────────────────────────
// Walk msm-portal-web/src/**/*.{ts,tsx}, count distinct files that
// reference each cataloged MC* name. Backfills `usage_stats.file_count`
// + `usage_stats.last_scanned` on every component (overwriting stale
// counts). Skipped when SOURCE_WORKSPACE is missing.

const componentNames = [];
for (const cat of components.categories ?? []) {
  for (const c of cat.components ?? []) {
    if (typeof c.name === 'string' && /^MC[A-Z]\w*$/.test(c.name)) componentNames.push(c.name);
  }
}

const usageCounts = new Map(); // name -> distinct file count
const providerInference = new Map(); // name -> Set<provider>
let codebaseScanned = false;
let codebaseFileCount = 0;

if (existsSync(CODEBASE_SRC)) {
  codebaseScanned = true;
  const sourceFiles = [];
  walkDir(CODEBASE_SRC, sourceFiles, (p) => /\.(tsx?|jsx?)$/.test(p));
  codebaseFileCount = sourceFiles.length;
  console.log(`[stage A] scanning ${sourceFiles.length} source files for usage + provider hints...`);

  const componentTokenRe = new Map();
  for (const n of componentNames) {
    componentTokenRe.set(n, new RegExp(`\\b${n}\\b`));
  }

  for (const file of sourceFiles) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const [name, re] of componentTokenRe) {
      if (re.test(text)) {
        usageCounts.set(name, (usageCounts.get(name) ?? 0) + 1);
      }
    }
  }

  // Stage B — per-component source file scan for provider imports.
  // Cheaper than ts-morph for a regex inference. We accept some false
  // negatives (e.g. providers injected via wrapper hooks) in exchange for
  // zero tsconfig dependency.
  for (const cat of components.categories ?? []) {
    for (const c of cat.components ?? []) {
      if (!c.path || typeof c.path !== 'string') continue;
      const compFile = join(CODEBASE_COMPONENT_BASE, c.path);
      if (!existsSync(compFile)) continue;
      let text;
      try {
        text = readFileSync(compFile, 'utf8');
      } catch {
        continue;
      }
      const providers = new Set();
      if (/from\s+['"]formik['"]/.test(text) || /\buseField\(/.test(text)) {
        providers.add('Formik');
        providers.add('ThemeProvider'); // every Formik consumer styles via theme
      }
      if (/from\s+['"]styled-components['"]/.test(text) || /theme\.mcui\b/.test(text)) {
        providers.add('ThemeProvider');
      }
      if (/from\s+['"]react-i18next['"]/.test(text) || /\buseTranslation\(/.test(text)) {
        providers.add('I18nextProvider');
      }
      if (
        /from\s+['"]react-router-dom['"]/.test(text) ||
        /\buseNavigate\(|\buseSearchParams\(|\buseParams\(/.test(text)
      ) {
        providers.add('BrowserRouter');
      }
      if (/from\s+['"]@tanstack\/react-query['"]/.test(text) || /\buseQuery\(|\buseMutation\(/.test(text)) {
        providers.add('ReactQueryProvider');
      }
      if (/MCInAppAlertProvider|\buseInAppAlert\(/.test(text)) {
        providers.add('MCInAppAlertProvider');
      }
      if (providers.size > 0) providerInference.set(c.name, providers);
    }
  }
} else {
  console.log(`[stage A] SOURCE_WORKSPACE missing at ${SOURCE_WORKSPACE} — skipping codebase usage scan + provider backfill.`);
}

// ─── Stage A/B apply — write usage_stats + backfill requiredProviders ──

const todayIso = new Date().toISOString().slice(0, 10);
let usageStatsRefreshed = 0;
let providerBackfilled = 0;

for (const cat of components.categories ?? []) {
  for (const c of cat.components ?? []) {
    if (!c.name) continue;

    // Stage A — usage stats
    if (codebaseScanned) {
      const count = usageCounts.get(c.name) ?? 0;
      const prev = c.usage_stats ?? {};
      c.usage_stats = {
        ...prev,
        file_count: count,
        last_scanned: todayIso,
        scan_source: 'extract-cross-refs (msm-portal-web)',
      };
      usageStatsRefreshed++;
    }

    // Stage B — provider backfill (only when components.json had no entry
    // AND component-dependencies.json had nothing — preserves the curated
    // canonical mapping in deps.json as the source of truth).
    if (
      codebaseScanned &&
      Array.isArray(c.requiredProviders) &&
      c.requiredProviders.length === 0
    ) {
      const inferred = providerInference.get(c.name);
      if (inferred && inferred.size > 0) {
        c.requiredProviders = Array.from(inferred).sort();
        providerBackfilled++;
      }
    }
  }
}

function walkDir(dir, out, filter) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === 'build') {
        continue;
      }
      walkDir(full, out, filter);
    } else if (ent.isFile() && filter(full)) {
      out.push(full);
    }
  }
}

// Stamp ontology metadata on the meta block. Re-use the previous
// `generatedAt` when the rest of the content is unchanged, so a clean
// re-run does not produce a no-op git diff.
components.meta = components.meta ?? {};
const previousMeta = components.meta.ontology_xref ?? null;
components.meta.ontology_xref = {
  generator: 'scripts/extract-cross-refs.mjs',
  generatedAt: previousMeta?.generatedAt ?? new Date().toISOString(),
  fields: [
    'usedInPatterns',
    'relatedComponents',
    'requiredProviders',
    'usage_stats.file_count',
  ],
  codebase_scanned: codebaseScanned,
  codebase_file_count: codebaseScanned ? codebaseFileCount : null,
  notes:
    'usedInPatterns derived from patterns.json code blocks; requiredProviders sourced from component-dependencies.json with codebase import-inference backfill when missing; relatedComponents = union(existing, commonly_paired_with, same-folder siblings); usage_stats.file_count = distinct *.{ts,tsx} files referencing the component across msm-portal-web/src (when SOURCE_WORKSPACE available).',
};

const nextSerialized = JSON.stringify(components, null, 2) + '\n';
const previousSerialized = (() => {
  try {
    return readFileSync(COMPONENTS_JSON, 'utf8');
  } catch {
    return null;
  }
})();
if (previousSerialized === nextSerialized) {
  console.log('=== Ontology Phase 0 cross-ref extraction ===');
  console.log(`  Total components:           ${stats.total}`);
  console.log(`  with usedInPatterns:        ${stats.withPatterns}`);
  console.log(`  with requiredProviders:     ${stats.withProviders}`);
  console.log(`  with relatedComponents:     ${stats.withRelated}`);
  console.log('  Output: components.json unchanged (idempotent)');
  process.exit(0);
}

// Content changed — bump generatedAt and persist.
components.meta.ontology_xref.generatedAt = new Date().toISOString();
writeFileSync(COMPONENTS_JSON, JSON.stringify(components, null, 2) + '\n');

console.log('=== Ontology Phase 0 cross-ref extraction ===');
console.log(`  Total components:           ${stats.total}`);
console.log(`  with usedInPatterns:        ${stats.withPatterns}`);
console.log(`  with requiredProviders:     ${stats.withProviders}`);
console.log(`  with relatedComponents:     ${stats.withRelated}`);
if (codebaseScanned) {
  const total = componentNames.length;
  const used = [...usageCounts.values()].filter((v) => v > 0).length;
  console.log(`  codebase scan:              ${codebaseFileCount} source files`);
  console.log(`  usage_stats refreshed:      ${usageStatsRefreshed}`);
  console.log(`  catalogued names with usage>0: ${used} / ${total}`);
  console.log(`  requiredProviders backfilled: ${providerBackfilled}`);
}
console.log(`  Output: ${COMPONENTS_JSON}`);

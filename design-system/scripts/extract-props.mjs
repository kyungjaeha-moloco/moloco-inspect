#!/usr/bin/env node
/**
 * Extract Component Props using ts-morph (TypeScript Compiler API).
 *
 * Replaces the regex-based prop-check.mjs for full TypeScript type resolution.
 * Handles utility types (Omit, Pick, ComponentProps), intersections (& {}),
 * generics, and forwardRef wrappers.
 *
 * Output: design-system/src/component-props.json — keyed by component name.
 *
 * Usage:
 *   node scripts/extract-props.mjs
 *
 * Plan: docs/superpowers/plans/2026-05-07-molly-ds-loop-v2-research-informed.md (S2)
 */

import { Project, SyntaxKind } from 'ts-morph';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const DESIGN_SYSTEM_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(DESIGN_SYSTEM_DIR, '..');
const SOURCE_WORKSPACE = resolve(REPO_ROOT, '..', 'Agent-Design-System');
const COMPONENTS_JSON = join(DESIGN_SYSTEM_DIR, 'src', 'components.json');
const CODEBASE_BASE = join(SOURCE_WORKSPACE, 'msm-portal', 'js', 'msm-portal-web', 'src', 'common', 'component');
const TSCONFIG_PATH = join(SOURCE_WORKSPACE, 'msm-portal', 'js', 'msm-portal-web', 'tsconfig.app.json');
const OUTPUT_PATH = join(DESIGN_SYSTEM_DIR, 'src', 'component-props.json');

// ─── Sanity checks ──────────────────────────────────────────────────────────

if (!existsSync(COMPONENTS_JSON)) {
  console.error(`components.json not found at ${COMPONENTS_JSON}`);
  process.exit(2);
}

if (!existsSync(CODEBASE_BASE)) {
  console.error(`Codebase not found at ${CODEBASE_BASE}`);
  console.error('Ensure Agent-Design-System/ is checked out alongside moloco-inspect/.');
  process.exit(2);
}

if (!existsSync(TSCONFIG_PATH)) {
  console.error(`tsconfig.app.json not found at ${TSCONFIG_PATH}`);
  process.exit(2);
}

// ─── Load components.json ────────────────────────────────────────────────────

const componentsData = JSON.parse(readFileSync(COMPONENTS_JSON, 'utf8'));

const targets = []; // { name, path, fullPath }
for (const category of componentsData.categories ?? []) {
  for (const comp of category.components ?? []) {
    if (!comp.name || !comp.path) continue;
    if (comp.path.startsWith('@')) continue; // external library
    const fullPath = join(CODEBASE_BASE, comp.path);
    if (!existsSync(fullPath)) continue;
    targets.push({ name: comp.name, path: comp.path, fullPath });
  }
}

console.log(`Loading TypeScript project from ${TSCONFIG_PATH}...`);
console.log(`Targets: ${targets.length} components from components.json\n`);

// ─── Initialize ts-morph project ─────────────────────────────────────────────

const project = new Project({
  tsConfigFilePath: TSCONFIG_PATH,
  skipAddingFilesFromTsConfig: false,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncateType(text, max = 200) {
  if (text.length <= max) return text;
  return text.substring(0, max) + '...';
}

/**
 * Find the props type for a component file.
 * Heuristics in order:
 *   1. Type alias / interface whose name matches /^MT.*Props\w*$/
 *   2. The first parameter type of the default-exported component function
 */
function findPropsType(sourceFile) {
  // 1. Look for MT*Props type alias or interface
  const typeAlias = sourceFile.getTypeAliases().find((t) => /^MT.*Props\w*$/.test(t.getName()));
  if (typeAlias) return { node: typeAlias, kind: 'typeAlias', name: typeAlias.getName() };

  const iface = sourceFile.getInterfaces().find((i) => /^MT.*Props\w*$/.test(i.getName()));
  if (iface) return { node: iface, kind: 'interface', name: iface.getName() };

  // 2. Fallback: arrow function or function declaration with `(props: T) =>`
  for (const decl of sourceFile.getVariableDeclarations()) {
    const initializer = decl.getInitializer();
    if (!initializer) continue;
    const arrow = initializer.asKind(SyntaxKind.ArrowFunction);
    if (!arrow) continue;
    const param = arrow.getParameters()[0];
    if (!param) continue;
    const typeNode = param.getTypeNode();
    if (typeNode) {
      return { node: param, kind: 'paramType', name: `(${decl.getName()} props)` };
    }
  }

  return null;
}

/**
 * Extract a JSDoc summary from a property declaration, if present.
 */
function getJsDocSummary(decl) {
  if (!decl || typeof decl.getJsDocs !== 'function') return undefined;
  const jsdocs = decl.getJsDocs();
  if (!jsdocs.length) return undefined;
  const text = jsdocs[0].getDescription().trim();
  return text || undefined;
}

// ─── Extract ────────────────────────────────────────────────────────────────

const result = {};
const stats = { processed: 0, noPropsType: 0, errored: 0, totalProps: 0 };

for (const target of targets) {
  const sourceFile = project.getSourceFile(target.fullPath);
  if (!sourceFile) {
    stats.errored++;
    console.warn(`  ✗ ${target.name} — source file not loaded by tsconfig (${target.path})`);
    continue;
  }

  const propsTypeRef = findPropsType(sourceFile);
  if (!propsTypeRef) {
    stats.noPropsType++;
    console.warn(`  ⚠ ${target.name} — no MT*Props type found (${target.path})`);
    continue;
  }

  let type;
  try {
    if (propsTypeRef.kind === 'paramType') {
      type = propsTypeRef.node.getType();
    } else {
      type = propsTypeRef.node.getType();
    }
  } catch (err) {
    stats.errored++;
    console.warn(`  ✗ ${target.name} — type resolve failed: ${err.message}`);
    continue;
  }

  const properties = type.getProperties();
  const props = [];
  for (const prop of properties) {
    let propName, propType, isOptional, description;
    try {
      propName = prop.getName();
      const declarations = prop.getDeclarations();
      const declaration = declarations[0];
      const refNode = declaration ?? propsTypeRef.node;
      propType = prop.getTypeAtLocation(refNode);
      isOptional = prop.isOptional();
      description = getJsDocSummary(declaration);
    } catch (err) {
      // Skip props that cannot be resolved (rare — happens with some recursive generics)
      continue;
    }
    props.push({
      name: propName,
      required: !isOptional,
      type: truncateType(propType.getText()),
      ...(description ? { description } : {}),
    });
  }

  result[target.name] = {
    path: target.path,
    sourceTypeName: propsTypeRef.name,
    sourceTypeKind: propsTypeRef.kind,
    props,
  };

  stats.processed++;
  stats.totalProps += props.length;

  if (stats.processed % 10 === 0) {
    console.log(`  Processed ${stats.processed} / ${targets.length}`);
  }
}

// ─── Write output ────────────────────────────────────────────────────────────

const output = {
  $schema: 'component-props',
  meta: {
    description: 'Extracted props per component using ts-morph. Auto-generated — do not edit manually.',
    generatedAt: new Date().toISOString(),
    extractor: 'scripts/extract-props.mjs',
    sourceTsconfig: TSCONFIG_PATH,
    componentCount: stats.processed,
    propCount: stats.totalProps,
  },
  components: result,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

console.log('\n=== Summary ===');
console.log(`  Processed:        ${stats.processed} / ${targets.length}`);
console.log(`  No props type:    ${stats.noPropsType}`);
console.log(`  Errored:          ${stats.errored}`);
console.log(`  Total props:      ${stats.totalProps}`);
console.log(`  Avg props/comp:   ${stats.processed > 0 ? (stats.totalProps / stats.processed).toFixed(1) : 0}`);
console.log(`\n  Output: ${OUTPUT_PATH}`);

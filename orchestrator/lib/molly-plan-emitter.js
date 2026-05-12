// orchestrator/lib/molly-plan-emitter.js
//
// Plan emission — extracts the LLM call + DS context loading + JSON parsing
// from server.js /api/plan into a lib. Phase 3 Task 3.1 sub-phase B.2.
// /api/plan is kept as a thin wrapper for backward compatibility.
// molly-intake's handleClarificationAnswer also calls the same lib —
// single source of truth for the plan emit ceremony.
//
// Receives designSystemRoot / requestSchemaPath via ctx — caller injects the
// module-level constants from server.js. DESIGN_SYSTEM_ROOT env var is the
// fallback. API key is read directly from process.env (same policy as server.js).

import path from 'node:path';
import fs from 'node:fs';

// Model + thinking budget are loaded dynamically from the molly-settings store —
// changeable at runtime from the Inspect Console UI (Settings tab).
import { getMollySettings, buildThinkingConfig } from './molly-settings.js';
import { recordEvent } from './molly-metrics.js';

export const SYSTEM_PROMPT = `You help PMs at Moloco plan UI changes for the MSM Portal.

**Language rule (critical):** ALL textual output fields (summary, plan_items[*].title, plan_items[*].description, unresolved_components[*].intent, unresolved_components[*].reason) MUST be written in English regardless of the user's input language. The user may write PRDs in any language (e.g. Korean), but you always reply in English so downstream tools render consistently. Exception: when a plan_item description references actual product UI copy that will end up in the rendered app (Tving is the primary client — its end-users read Korean; msm-portal supports KR + EN via i18n), the verbatim user-facing copy may be quoted in Korean inside the otherwise-English description — e.g. \`Show a button labelled "확인"\`. The surrounding prose stays English; only the verbatim quoted copy may be Korean. Follow any locale or i18n key the PRD specifies.

You have access to a structured design system:
- patterns.json: composition patterns (app-shell, list-page, detail-page, form-basic, etc.)
- components.json: full MSM Portal component catalog — name, importStatement, when_to_use, do_not_use, antiPatterns, functional_category, status (~112 components across 16 categories)
- component-props.json: per-component props extracted via TypeScript Compiler API (ts-morph) — { name, type, required, description }. Authoritative for prop-level decisions. Subset of components.json — some entries may be absent (use the catalog as fallback).
- api-ui-contracts.json: entity definitions (Creative, Order, Advertiser, Product, AuctionOrder, PublisherTarget)
- pm-sa-request-schema.json: structured request contract with a change_intent enum

Your task: given a PM's goal, output a concrete plan as JSON. Ground your plan in real patterns, entities, components, and file paths from the DS resources provided.

## Grounding rules (strict)
- ONLY reference pattern_id values that exist in patterns.json. Never invent a pattern name.
- ONLY reference entity names that exist in api-ui-contracts.json. Use null if unsure.
- ONLY reference feature flag names, route keys, i18n keys, and component names that appear in the provided JSON. Never invent them.
- ONLY reference component names that appear in components.json. If a desired functionality has no matching component, say so explicitly in the plan summary rather than guessing a name.
- When mentioning a component in plan_item descriptions, use its \`importStatement\` verbatim — do not reconstruct import paths from memory. The \`importPath\` / \`importStatement\` fields in components.json are authoritative.
- Honor each component's \`when_to_use\` / \`do_not_use\` / \`antiPatterns\`: if a component matches the goal but its do_not_use rule applies, pick a different one (or say none fits).
- For prop usage, consult component-props.json first. When a component appears there, mention any \`required: true\` props verbatim in the plan_item description so downstream agents know they must be set. Do NOT invent prop names that are absent from component-props.json. If a component is not in component-props.json, fall back to intent-only language ("text input with placeholder"). Prop-level correctness remains enforced downstream by a typecheck verification step (\`runTypecheck\` in the change-request pipeline) — component-props.json reduces mismatch frequency, the typechecker is the safety net.
- For target_file, prefer the file paths or location templates that appear in patterns.json (layer_structure.location, file_checklist). When the exact file is unknown, use the pattern's template form (e.g. "src/apps/{client}/container/{entity}/list/MC{Entity}ListContainer.tsx") — do not guess a concrete filename.
- If the request can't be met with the provided DS, say so in summary and mark affected plan_items with pattern_id: null.

## Visual/UX constraints to carry forward (for downstream execution)
Include the following in an array field "visual_constraints" at the top level. Downstream agents will use these when generating actual screens so the output matches the existing product:
- "Follow the existing visual vocabulary of the target client (color, typography, spacing, density, shadow, radius)."
- "Use tokens from design-system/src/tokens.json only. No hardcoded hex/px/font."
- "No aggressive gradient backgrounds."
- "No emoji unless the brand already uses them."
- "No rounded-container-with-left-border-accent tropes."
- "Do not draw icons/imagery as freehand SVG. Use icons from components.json icon catalog, or a placeholder box."
- "Do not substitute overused fonts (Inter, Roboto, Arial, system). Use the DS typography tokens."
- "A correct placeholder is better than a bad attempt at the real component."

## Component reference tracking (S3 — surface to user)
- After composing plan_items, list every DS component you referenced under top-level field \`referenced_components\` with the exact { name, importStatement, status } as found in components.json. Deduplicate.
- If a desired functionality has no exact match in components.json (do NOT invent one), list it under \`unresolved_components\` with: { intent (1 line, in English — what the user wants), closest_match (closest existing component name from components.json, or null if nothing close), reason (1 line, in English — why none of the catalog components fits) }. Empty array is fine.
- These two fields enable the 3 surfaces (Slack/Playground/Chrome ext) to render component badges and a "DS missing" UX so the user sees what was used and what was not. Be honest and exhaustive — over-listing is better than missing entries.

Output MUST be valid JSON only (no markdown, no prose). Schema:
{
  "intent": "<one of: copy_update|spacing_adjustment|token_alignment|component_swap|layout_adjustment|state_handling|accessibility_improvement|new_page|new_feature|data_display_change|form_field_addition|bulk_operation>",
  "target_entity": "<Creative|Order|Advertiser|Product|AuctionOrder|PublisherTarget|null>",
  "summary": "<1-2 sentence summary of what will change, in English>",
  "visual_constraints": ["<string>", "..."],
  "plan_items": [
    {
      "id": "<unique kebab-case id>",
      "title": "<Short action description in English>",
      "description": "<1-2 sentence technical detail in English>",
      "pattern_id": "<pattern id from patterns.json or null>",
      "target_file": "<relative file path or template form from patterns.json, or null>",
      "depends_on": []
    }
  ],
  "referenced_components": [
    { "name": "<MC* component name from components.json>", "importStatement": "<verbatim from components.json>", "status": "<status field from components.json>" }
  ],
  "unresolved_components": [
    { "intent": "<English — what the user wanted>", "closest_match": "<MC* name or null>", "reason": "<English — why nothing fits>" }
  ]
}

Generate 3-8 plan items covering the full scope — nav changes, route registration, i18n keys, container/component files, feature flags, etc.`;

/**
 * Plan emit — receives a PRD goal and returns a DS-grounded structured plan.
 *
 * @param {string|object} args — string = goal only, object = { goal, client?, routeOrPage?, jiraUrl?, prdUrl?, previousPlan?, feedback? }
 * @param {object} [ctx] — { designSystemRoot, requestSchemaPath }
 * @returns {Promise<object>} plan — { intent, target_entity, summary, visual_constraints, plan_items }
 * @throws {Error} `emitPlan: <reason>` — caller branches on the message (required / not configured / LLM error / invalid JSON)
 *
 * "Re-plan" call:
 *   When args.previousPlan + args.feedback are both provided, appends a
 *   "previous plan + user feedback" block to the user prompt. System / DS
 *   context is unchanged → prompt cache (cacheRead) still hits.
 */
export async function emitPlan(args, ctx = {}) {
  const t0 = Date.now();
  const goal = typeof args === 'string' ? args : args?.goal;
  if (!goal || typeof goal !== 'string' || !goal.trim()) {
    throw new Error('emitPlan: goal required');
  }
  const client = (typeof args === 'object' && args?.client) || ctx.client || 'msm-default';
  const routeOrPage = (typeof args === 'object' && args?.routeOrPage) || ctx.routeOrPage || '/';
  const jiraUrl = (typeof args === 'object' ? args.jiraUrl : null) || null;
  const prdUrl = (typeof args === 'object' ? args.prdUrl : null) || null;
  const previousPlan = (typeof args === 'object' ? args.previousPlan : null) || null;
  const feedback =
    typeof args === 'object' && typeof args.feedback === 'string' ? args.feedback.trim() : '';

  const apiKey = process.env.ANTHROPIC_API_KEY ||
    (process.env.SANDBOX_PROVIDER === 'anthropic'
      ? (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '')
      : '');
  if (!apiKey) {
    throw new Error('emitPlan: ANTHROPIC_API_KEY not configured');
  }

  const dsRoot = ctx.designSystemRoot || process.env.DESIGN_SYSTEM_ROOT;
  if (!dsRoot) {
    throw new Error('emitPlan: designSystemRoot not provided (set DESIGN_SYSTEM_ROOT env or pass via ctx)');
  }
  const requestSchemaPath = ctx.requestSchemaPath || path.join(dsRoot, 'src', 'pm-sa-request-schema.json');
  const patternsPath = path.join(dsRoot, 'src', 'patterns.json');
  const apiContractsPath = path.join(dsRoot, 'src', 'api-ui-contracts.json');
  const componentsPath = path.join(dsRoot, 'src', 'components.json');
  const componentPropsPath = path.join(dsRoot, 'src', 'component-props.json');
  const patterns = readJsonSafe(patternsPath, {});
  const apiContracts = readJsonSafe(apiContractsPath, {});
  const requestSchema = readJsonSafe(requestSchemaPath, {});
  // C (2026-05-07): inject the full component catalog. Without this the
  // emitter only knows pattern names + entity names — it has to guess
  // which concrete components to compose, which produced hallucinated
  // imports / wrong prop intent (incident 2026-05-07: TS2769 / TS2741 in
  // a generated demo section). Plan: docs/superpowers/plans/
  // 2026-05-07-plan-emitter-design-system-manifest.md
  //
  // mtime-aware cache so design-system updates propagate without an
  // orchestrator restart. components.json is the largest block (~458KB)
  // and the most likely to drift, so the staleness cost is highest here —
  // patterns / api-contracts / request-schema are still per-call reads
  // (cheap relative to the LLM call) which is fine for now.
  const components = readComponentsCached(componentsPath);
  // S2 (2026-05-07): component-props.json — extracted via ts-morph for
  // prop-level grounding. mtime-aware cache like components.json.
  const componentProps = readComponentPropsCached(componentPropsPath);

  // Phase: prompt caching (#1) — DS resources are the same large static block
  // on every call. Placing cache_control: ephemeral on the last block caches
  // the accumulated prefix. The first call incurs cache_creation_input_tokens;
  // subsequent calls use cache_read_input_tokens, reducing latency + cost.
  // components.json is the largest block (~458KB) so cache hits are most
  // valuable — keep it last so it is covered by the cache_control block.
  const systemBlocks = [
    { type: 'text', text: SYSTEM_PROMPT },
    { type: 'text', text: `pm-sa-request-schema:\n${JSON.stringify(requestSchema, null, 2)}` },
    { type: 'text', text: `patterns.json:\n${JSON.stringify(patterns, null, 2)}` },
    { type: 'text', text: `api-ui-contracts.json:\n${JSON.stringify(apiContracts, null, 2)}` },
    { type: 'text', text: `components.json:\n${JSON.stringify(components, null, 2)}` },
    {
      type: 'text',
      text: `component-props.json:\n${JSON.stringify(componentProps, null, 2)}`,
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
  ];

  let userPrompt = `PM 요청:
Goal: ${goal}
Client: ${client}
Target page: ${routeOrPage}
${jiraUrl ? `Jira: ${jiraUrl}\n` : ''}${prdUrl ? `PRD: ${prdUrl}\n` : ''}
위 system 의 DS 리소스 (pm-sa-request-schema / patterns.json / api-ui-contracts.json / components.json) 를 근거로 계획을 JSON으로 출력하세요.`;

  // "Re-plan" mode — append previous plan + user feedback.
  if (previousPlan && feedback) {
    userPrompt += `

---
이전 계획 (사용자가 일부 수정 요청):
${JSON.stringify(previousPlan, null, 2)}

사용자 피드백:
${feedback}

위 피드백을 반영해 plan 을 다시 만드세요. 항목 수는 유지하거나 늘려도 됩니다. DS 리소스 grounding rules 는 그대로 따릅니다.`;
  }

  const settings = getMollySettings();
  const thinkingBudget = settings.planThinkingBudget;
  const useThinking = thinkingBudget > 0;
  const reqBody = {
    model: settings.planModel,
    max_tokens: useThinking ? thinkingBudget + 4096 : 4096,
    system: systemBlocks,
    messages: [{ role: 'user', content: userPrompt }],
    // Per-model thinking control. Adaptive models (Opus/Sonnet 4.6+)
    // get `thinking:{type:'adaptive'}` + `output_config.effort`; older
    // models get the legacy `budget_tokens`. See molly-settings.js.
    ...buildThinkingConfig(settings.planModel, thinkingBudget),
  };
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(reqBody),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error(`[plan-emitter] LLM ${resp.status}: ${errText.slice(0, 400)}`);
    throw new Error(`emitPlan: LLM error ${resp.status}`);
  }

  const result = await resp.json();
  // When thinking is on, content[0] is a thinking block — extract only type=text blocks.
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const textBlock = blocks.find((b) => b?.type === 'text');
  const text = (textBlock?.text || '').trim();
  if (!text) {
    throw new Error('emitPlan: empty LLM response');
  }

  const cleaned = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[plan-emitter] No JSON in response:', cleaned.slice(0, 200));
    throw new Error('emitPlan: LLM response not JSON');
  }

  let plan;
  try {
    plan = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[plan-emitter] JSON parse failed:', err.message);
    throw new Error(`emitPlan: invalid JSON — ${err.message}`);
  }

  const u = result?.usage || {};
  console.log(
    `[plan-emitter] Generated ${plan.plan_items?.length || 0} items for client=${client} route=${routeOrPage} | ` +
    `refs=${plan.referenced_components?.length ?? 'null'} unresolved=${plan.unresolved_components?.length ?? 'null'} | ` +
    `usage: input=${u.input_tokens ?? '?'} output=${u.output_tokens ?? '?'} ` +
    `cache_create=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0}`,
  );
  recordEvent('lib_call', {
    lib: 'plan-emitter',
    surface: ctx.surface,
    model: settings.planModel,
    latency_ms: Date.now() - t0,
    n_items: plan.plan_items?.length ?? 0,
    thinking: useThinking,
    thinking_budget: useThinking ? thinkingBudget : 0,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_create: u.cache_creation_input_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
  });
  return plan;
}

function readJsonSafe(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

// Module-scoped cache for components.json — the file is ~458KB and dominates
// system-prompt construction time. Re-parsing on every emitPlan call is
// wasteful; restarting the orchestrator on every design-system tweak is
// painful. Compromise: stat once per call, reuse the parsed object while
// mtime is unchanged. Mirrors the molly-settings.js mtime-cache pattern.
let _componentsCache = null;
let _componentsCacheMtimeMs = 0;

function readComponentsCached(filePath) {
  let currentMtimeMs = 0;
  try {
    currentMtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    // file missing — fall through; cache stays as-is or rebuilds empty
  }
  if (_componentsCache && currentMtimeMs === _componentsCacheMtimeMs) {
    return _componentsCache;
  }
  const next = readJsonSafe(filePath, {});
  _componentsCache = next;
  _componentsCacheMtimeMs = currentMtimeMs;
  console.log(
    `[plan-emitter] components.json loaded (mtime=${new Date(currentMtimeMs).toISOString()})`,
  );
  return _componentsCache;
}

// S2 (2026-05-07): same mtime-cache pattern for component-props.json
// (ts-morph extracted props). component-props.json is regenerated by
// design-system/scripts/extract-props.mjs — this cache picks up new
// extractions on the next plan call without an orchestrator restart.
let _componentPropsCache = null;
let _componentPropsCacheMtimeMs = 0;

function readComponentPropsCached(filePath) {
  let currentMtimeMs = 0;
  try {
    currentMtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    // file missing — fall through; absent file degrades to empty object,
    // SYSTEM_PROMPT already says to fall back to components.json in that case.
  }
  if (_componentPropsCache && currentMtimeMs === _componentPropsCacheMtimeMs) {
    return _componentPropsCache;
  }
  const next = readJsonSafe(filePath, {});
  _componentPropsCache = next;
  _componentPropsCacheMtimeMs = currentMtimeMs;
  console.log(
    `[plan-emitter] component-props.json loaded (mtime=${new Date(currentMtimeMs).toISOString()})`,
  );
  return _componentPropsCache;
}

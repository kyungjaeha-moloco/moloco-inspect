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
import { loadImageBlock, describeAttachment } from './image-attachment.js';

export const SYSTEM_PROMPT = `You help PMs at Moloco plan UI changes for the MSM Portal.

**Language rule (CRITICAL — explicit, non-negotiable):**

**Step 1 — detect the language of the PRD body.** Look at the "Goal:" line in the user message. Whatever language that sentence is written in is your output language. Korean characters → reply in Korean. English-only → reply in English. Mixed → dominant language wins.

**Step 2 — IGNORE the Context prefix language for choosing reply language.** The Context line (e.g. \`Context: client=tving route=/oms language=ko\`) describes the *runtime locale of the target app* — it tells you which language the UI copy *rendered inside the product* should be in. It does NOT decide which language YOU reply in. A user can write an English PRD on a Korean Tving app; you still reply in English.

**Worked examples:**
- Goal: \`Please swap 'Status' and 'Ad Account' columns.\` · Context: \`client=tving language=ko\` → reply in **English** (PRD body is English). Inside descriptions, only the literal UI copy stays Korean if/when quoted (e.g. \`shows a "상태" badge\`).
- Goal: \`상태와 광고 계정 열 순서 바꿔줘\` · Context: \`client=tving language=ko\` → reply in **Korean** (PRD body is Korean).
- Goal: \`Add a "삭제됨" tab to Creative Review\` · Context: \`client=tving language=ko\` → reply in **English** (PRD body is English; the quoted Korean string \`"삭제됨"\` is just inline UI copy).

**Scope of the rule:** summary, plan_items[*].title, plan_items[*].description, unresolved_components[*].intent, unresolved_components[*].reason. Identifier-shaped fields stay literal regardless of language: intent enum, target_entity, pattern_id, target_file, referenced_components[*].name, referenced_components[*].importStatement, unresolved_components[*].kind, closest_match.name, closest_match.importStatement — these are code references, not prose.

You have access to a structured design system. **Read DESIGN.md first** — it is the foundation layer (Layer 0) carrying brand identity, authority hierarchy, and Do's & Don'ts that frame every other contract below. All other contracts operate within the principles DESIGN.md defines.
- DESIGN.md: **foundation layer** — brand identity, authority hierarchy, design tokens summary, 16-category component index (name only), Do's & Don'ts. Read this before the contracts below.
- patterns.json: composition patterns (app-shell, list-page, detail-page, form-basic, etc.)
- components-index.json: lightweight lookup table — { name, importStatement, functional_category, status } for all ~112 components. Authoritative for component name validity + import path. **Does NOT include when_to_use / do_not_use / antiPatterns** — see closest_match / unresolved_components workflow when those rules matter.
- component-props.json: per-component props extracted via TypeScript Compiler API (ts-morph) — { name, type, required, description }. Authoritative for prop-level decisions.
- api-ui-contracts.json: entity definitions (Creative, Order, Advertiser, Product, AuctionOrder, PublisherTarget)
- pm-sa-request-schema.json: structured request contract with a change_intent enum

Your task: given a PM's goal, output a concrete plan as JSON. Ground your plan in real patterns, entities, components, and file paths from the DS resources provided.

## Grounding rules (strict)
- ONLY reference pattern_id values that exist in patterns.json. Never invent a pattern name.
- ONLY reference entity names that exist in api-ui-contracts.json. Use null if unsure.
- ONLY reference feature flag names, route keys, i18n keys, and component names that appear in the provided JSON. Never invent them.
- ONLY reference component names that appear in components-index.json. If a desired functionality has no matching component, say so explicitly in the plan summary rather than guessing a name.
- When mentioning a component in plan_item descriptions, use its \`importStatement\` verbatim from components-index.json — do not reconstruct import paths from memory.
- Component-level \`when_to_use\` / \`do_not_use\` / \`antiPatterns\` are NOT in this system block (kept out for cache efficiency). If your plan_item depends on those rules to choose between two similar components, prefer adding an entry to \`unresolved_components\` with the closest_match — downstream review will resolve via the full \`components.json\`.
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
- If a desired functionality has no exact match in components.json (do NOT invent one), list it under \`unresolved_components\` with:
  - \`intent\` (1 line, in English — what the user wants)
  - \`closest_match\` — object \`{ name, importStatement, similarity_score, reasoning }\` describing the nearest existing DS component (or \`null\` if nothing close).
    - \`name\` — MC* component name from components.json
    - \`importStatement\` — verbatim from components.json
    - \`similarity_score\` — number in [0, 1] (0.0 = unrelated, 0.5 = same family different prop set, 1.0 = nearly equivalent). Be conservative — only output ≥ 0.7 when the closest_match could plausibly fulfill the user intent with at most prop tweaks.
    - \`reasoning\` — 1 line, in English, why this component is the closest match
  - \`kind\` — one of \`new_component\` (genuinely missing) | \`extension\` (existing component needs a new prop/variant) | \`composition_miss\` (probably achievable by composing existing components but you are not sure how).
  - \`reason\` (1 line, in English — why none of the catalog components fits as-is)
  Empty array is fine.
- These two fields enable the 3 surfaces (Slack/Playground/Chrome ext) to render component badges and a "DS missing" UX — including the 4-option escalation card (closest_match progress / custom build / propose new / extend existing). Be honest and exhaustive — over-listing is better than missing entries.

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
    {
      "intent": "<English — what the user wanted>",
      "closest_match": { "name": "<MC* name>", "importStatement": "<verbatim from components.json>", "similarity_score": 0.0, "reasoning": "<English, 1 line>" } /* or null */,
      "kind": "<new_component|extension|composition_miss>",
      "reason": "<English — why nothing fits as-is>"
    }
  ]
}

Generate 3-8 plan items covering the full scope — nav changes, route registration, i18n keys, container/component files, feature flags, etc.

## Item style rule (USER-FACING — applies to title AND description)

plan_items[*].title and plan_items[*].description are read by a PM / service architect / designer who does NOT read code. Write in plain product language about what the end user sees or does after this item ships. The coding agent translates behavior into code on its own — your job is to describe outcomes, not implementations.

### Title
Short action description of the user-observable change. Each item must produce a user-observable change. Internal type definitions or schema setup are sub-steps of the parent item, NOT separate items.

### Description
- Open with the user-visible outcome ("이 작업이 끝나면 ... 보입니다 / 동작합니다" for Korean PRDs, "After this item ships, ... appears / works" for English PRDs).
- For 2+ sub-requirements, structure as \`(1) ... (2) ... (3) ...\` enumeration markers — the plan card UI renders these as an ordered list. A single narrative paragraph is fine for simple items.
- Refer to the UI area by its user-facing name ("the deleted tab", "the table top action bar", "the first column"), NOT by component or file name.

### FORBIDDEN tokens in title AND description
- Code identifiers — PascalCase or camelCase symbols (MC*, use*, get* etc.) like MCCreativeReviewContainer, MCBarTabs, useSearchParams, getCreativeImageRenderer.
- File paths — anything containing \`src/\`, \`.tsx\`, \`.ts\`, \`.json\`.
- Import statements (\`import { X } from 'Y'\`).
- Library / framework keywords — route, scaffold, placeholder, fetching, mock, in-memory, wrapper, embed, MVP, API, hook, state, props, prop, scope, refactor, z-index, focus trap, render, component, DOM, ref, useQuery, useState, useEffect, tRPC, etc.
- Backticks (\`\`) wrapping any code-shaped token. If you need to quote UI copy verbatim, use plain double quotes — e.g. \`the "삭제됨" tab label\`, \`a button labelled "확인"\`.

### Where developer detail lives instead
Component / file / hook / import references belong in the structured schema fields, NOT in prose:
- \`target_file\` — the relative file path or pattern template.
- \`referenced_components[]\` — every DS component used, with name + importStatement + status verbatim from components-index.json.
- \`unresolved_components[]\` — DS-missing intent with closest_match.

The plan card UI, decomposer, and downstream code agents read those fields directly. Description prose is for humans who don't read code.

### Example (Creative Review deleted-tab case)
- BAD title: "Add 'Deleted' tab to MCCreativeReviewContainer"
- GOOD title (Korean PRD): "Creative Review 페이지에 '삭제됨' 탭 추가"
- GOOD title (English PRD): "Add a 'Deleted' tab to the Creative Review page"

- BAD description: "Modify src/apps/msm-default/container/creative-review/MCCreativeReviewContainer.tsx to add a third MCBarTabs entry (key: 'deleted'), with tab state synced via useSearchParams."
- GOOD description (Korean PRD): "이 작업이 끝나면 Creative Review 페이지 상단 탭 영역에 기존 '주문 포함'·'전체' 옆에 새 '삭제됨' 탭이 보입니다. (1) 탭을 클릭하면 삭제된 소재 목록 화면이 열리고 (2) 현재 보이는 탭은 URL에 저장되어 새로고침 후에도 유지되며 (3) 기본 탭은 기존과 동일하게 '주문 포함' 입니다."
- GOOD description (English PRD): "After this ships, the Creative Review page header gains a third tab labelled \"Deleted\" alongside the existing \"Order\" and \"All\". (1) Selecting the new tab opens the deleted-creatives list view, (2) the active tab is preserved across refresh via the URL, and (3) the default tab stays \"Order\" as before."`;

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
  const attachment =
    (typeof args === 'object' && args?.attachment && typeof args.attachment === 'object'
      ? args.attachment
      : null) ||
    (ctx?.attachment && typeof ctx.attachment === 'object' ? ctx.attachment : null);

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
  const designMdPath = path.join(dsRoot, 'src', 'DESIGN.md');
  const patterns = readJsonSafe(patternsPath, {});
  const apiContracts = readJsonSafe(apiContractsPath, {});
  const requestSchema = readJsonSafe(requestSchemaPath, {});
  // Track 1 (2026-05-17): condensed brief replaces full components.json in the
  // system block to slash cache_creation cost. DESIGN.md (~12KB) carries brand /
  // tokens / 16-category index + Do's-Don'ts. components-index.json (~5-10KB)
  // is built on-the-fly from components.json — name + importStatement +
  // functional_category + status only (when_to_use / do_not_use / antiPatterns
  // intentionally excluded — see SYSTEM_PROMPT for fallback workflow).
  //
  // Original 2026-05-07 rationale (full catalog inject): plan-emitter that only
  // knew pattern names hallucinated imports / wrong prop intent (TS2769 / TS2741).
  // The components-index keeps name validity guarantee while shrinking the block.
  const designMd = readDesignMdCached(designMdPath);
  const componentsIndex = readComponentsIndexCached(componentsPath);
  // S2 (2026-05-07): component-props.json — extracted via ts-morph for
  // prop-level grounding. mtime-aware cache like components.json.
  const componentProps = readComponentPropsCached(componentPropsPath);

  // Prompt caching: `cache_control: ephemeral, ttl: 1h` on the last block caches
  // the accumulated prefix. First call = cache_creation_input_tokens; subsequent
  // = cache_read_input_tokens. Track 1 v2 (2026-05-17): components.json full
  // serialization removed (~458KB → ~5-10KB components-index). DESIGN.md added.
  // Optimal cache_control position is measurement-dependent (T1.3) — defaulting
  // to component-props.json (the largest remaining block, most beneficial to cache).
  // Foundation order (2026-05-18): DESIGN.md is placed immediately after
  // SYSTEM_PROMPT so the planner sees brand identity / authority hierarchy /
  // Do's & Don'ts before the structured contracts below. Aligns with
  // CLAUDE.md / progressive disclosure best practice (Layer 0 always-on).
  const systemBlocks = [
    { type: 'text', text: SYSTEM_PROMPT },
    { type: 'text', text: `DESIGN.md:\n${designMd}` },
    { type: 'text', text: `pm-sa-request-schema:\n${JSON.stringify(requestSchema, null, 2)}` },
    { type: 'text', text: `patterns.json:\n${JSON.stringify(patterns, null, 2)}` },
    { type: 'text', text: `api-ui-contracts.json:\n${JSON.stringify(apiContracts, null, 2)}` },
    { type: 'text', text: `components-index.json:\n${JSON.stringify(componentsIndex, null, 2)}` },
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
위 system 의 DS 리소스 (pm-sa-request-schema / patterns.json / api-ui-contracts.json / components.json) 를 근거로 계획을 JSON으로 출력하세요.

[Style — system 의 USER-FACING 룰 재확인]
plan_items[*].title 과 description 모두 사용자가 보는 결과로만 작성하세요 — 구현 명칭(component/hook/import/file path)·backtick·코드 식별자는 어디에도 쓰지 마세요. description 은 "이 작업이 끝나면 ... 보입니다/동작합니다" 같은 결과 frame 으로 시작하고, 단계가 여럿이면 (1) (2) (3) 으로 나열하세요. 파일·컴포넌트·import 참조는 target_file / referenced_components / unresolved_components 스키마 필드에만 채우세요. 응답 언어는 위 PRD 본문(Goal)이 쓰여진 언어를 따르세요 — 한국어로 썼으면 한국어, 영어로 썼으면 영어, 혼합이면 더 우세한 언어. Context prefix 의 language 값은 앱 화면이 사용자에게 보일 때의 locale 일 뿐이며, 응답 언어가 아닙니다.`;

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

  // User-uploaded screenshot (Chrome ext region capture). Loaded as an
  // Anthropic image content block when present. System block cache is
  // unaffected — image lives in the user message, system prefix stays
  // byte-identical so `cache_read_input_tokens` keeps hitting.
  const userContent = [{ type: 'text', text: userPrompt }];
  const imageBlock = loadImageBlock(attachment);
  if (imageBlock) {
    userContent.push(imageBlock);
  }
  const attachmentInfo = describeAttachment(attachment);

  const reqBody = {
    model: settings.planModel,
    max_tokens: useThinking ? thinkingBudget + 14336 : 4096,
    system: systemBlocks,
    messages: [{ role: 'user', content: userContent }],
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
    console.error(
      `[plan-emitter] empty response — stop_reason=${result?.stop_reason} ` +
      `blocks=${JSON.stringify(blocks.map((b) => ({ type: b?.type, len: (b?.text || b?.thinking || '').length })))} ` +
      `usage=${JSON.stringify(result?.usage)}`,
    );
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
    const m = err.message.match(/position (\d+)/);
    const pos = m ? parseInt(m[1], 10) : -1;
    console.error('[plan-emitter] JSON parse failed:', err.message);
    if (pos >= 0) {
      const start = Math.max(0, pos - 120);
      const end = Math.min(jsonMatch[0].length, pos + 120);
      console.error(`[plan-emitter] context around position ${pos}:\n${jsonMatch[0].slice(start, end)}\n${' '.repeat(Math.min(120, pos - start))}^`);
    }
    console.error(`[plan-emitter] full raw (${jsonMatch[0].length} chars):\n${jsonMatch[0]}`);
    throw new Error(`emitPlan: invalid JSON — ${err.message}`);
  }

  const u = result?.usage || {};
  const imgLogPart = imageBlock
    ? `img_attached=1 size=${attachmentInfo.size ?? '?'}`
    : `img_attached=0${attachment ? ` skip=${attachmentInfo.reason}` : ''}`;
  console.log(
    `[plan-emitter] Generated ${plan.plan_items?.length || 0} items for client=${client} route=${routeOrPage} | ` +
    `refs=${plan.referenced_components?.length ?? 'null'} unresolved=${plan.unresolved_components?.length ?? 'null'} | ` +
    `${imgLogPart} | ` +
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
    img_attached: imageBlock ? 1 : 0,
    img_skip_reason: imageBlock ? null : (attachment ? attachmentInfo.reason : null),
    img_size_bytes: imageBlock ? (attachmentInfo.size ?? 0) : 0,
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

// Module-scoped cache for components-index — built from full components.json by
// extracting { name, importStatement, functional_category, status } only.
// Track 1 v2 (2026-05-17): full components.json (~458KB) replaced with slim
// index (~5-10KB) to slash cache_creation cost. when_to_use / do_not_use /
// antiPatterns intentionally excluded — see SYSTEM_PROMPT for the
// closest_match / unresolved_components fallback workflow.
let _componentsIndexCache = null;
let _componentsIndexCacheMtimeMs = 0;

function readComponentsIndexCached(filePath) {
  let currentMtimeMs = 0;
  try {
    currentMtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    // file missing — fall through; cache stays as-is or rebuilds empty
  }
  if (_componentsIndexCache && currentMtimeMs === _componentsIndexCacheMtimeMs) {
    return _componentsIndexCache;
  }
  const full = readJsonSafe(filePath, {});
  const index = buildComponentsIndex(full);
  _componentsIndexCache = index;
  _componentsIndexCacheMtimeMs = currentMtimeMs;
  console.log(
    `[plan-emitter] components-index built (${index.length} entries, mtime=${new Date(currentMtimeMs).toISOString()})`,
  );
  return _componentsIndexCache;
}

/**
 * Walk the nested categories tree in components.json and pull out just the
 * fields needed for plan-time grounding (name validity + import path).
 * Returns Array<{ name, importStatement, functional_category, status }>.
 */
function buildComponentsIndex(full) {
  const out = [];
  const cats = full?.categories || {};
  for (const [catIdx, catNode] of Object.entries(cats)) {
    const categoryName = catNode?.name || `category_${catIdx}`;
    const walk = (node) => {
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
      } else if (node && typeof node === 'object') {
        if (node.name && node.importStatement) {
          out.push({
            name: node.name,
            importStatement: node.importStatement,
            functional_category: node.functional_category || categoryName,
            status: node.status || null,
          });
          return;
        }
        for (const v of Object.values(node)) walk(v);
      }
    };
    walk(catNode);
  }
  return out;
}

// Module-scoped cache for DESIGN.md — the condensed plan-emitter brief
// (~12KB). mtime-aware so designer edits propagate without restart.
let _designMdCache = null;
let _designMdCacheMtimeMs = 0;

function readDesignMdCached(filePath) {
  let currentMtimeMs = 0;
  try {
    currentMtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    // file missing — return placeholder. Plan emit still works (degraded),
    // SYSTEM_PROMPT references DESIGN.md so missing file is a config error.
  }
  if (_designMdCache !== null && currentMtimeMs === _designMdCacheMtimeMs) {
    return _designMdCache;
  }
  let body = '';
  try {
    body = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.warn(`[plan-emitter] DESIGN.md read failed: ${err.message} — using placeholder`);
    body = '(DESIGN.md not available — see design-system/src/DESIGN.md)';
  }
  _designMdCache = body;
  _designMdCacheMtimeMs = currentMtimeMs;
  console.log(
    `[plan-emitter] DESIGN.md loaded (${body.length} bytes, mtime=${new Date(currentMtimeMs).toISOString()})`,
  );
  return _designMdCache;
}

// S2 (2026-05-07): same mtime-cache pattern for component-props.json
// (ts-morph extracted props).
//
// Track 1.5 (2026-05-17): C-S3 slim — drops per-component meta (path,
// sourceTypeName, sourceTypeKind, description) and removes ` | undefined`
// from optional types (the `required: false` flag already encodes it).
// Shrinks ~197KB → ~100KB. Full prop names + types + required flag
// preserved — typecheck downstream safety net unaffected.
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
  const full = readJsonSafe(filePath, {});
  const slim = buildComponentPropsSlim(full);
  _componentPropsCache = slim;
  _componentPropsCacheMtimeMs = currentMtimeMs;
  console.log(
    `[plan-emitter] component-props.json loaded (slim, mtime=${new Date(currentMtimeMs).toISOString()})`,
  );
  return _componentPropsCache;
}

/**
 * Build the slim component-props payload. Drops per-component meta and
 * per-prop description. Strips ` | undefined` from optional type strings
 * — the `required: false` flag already carries that signal.
 *
 * Returns: { [componentName]: Array<{ name, required, type }> }
 */
function buildComponentPropsSlim(full) {
  const comps = full?.components || {};
  const out = {};
  for (const [name, entry] of Object.entries(comps)) {
    const props = Array.isArray(entry?.props) ? entry.props : [];
    out[name] = props.map((p) => ({
      name: p.name,
      required: !!p.required,
      type: typeof p.type === 'string'
        ? p.type.replace(/\s*\|\s*undefined/g, '').trim()
        : p.type,
    }));
  }
  return out;
}

// orchestrator/lib/molly-plan-emitter.js
//
// Plan emission — server.js /api/plan 의 LLM 호출 + DS context loading
// + JSON parsing 을 lib 으로 추출. Phase 3 Task 3.1 sub-phase B.2.
// /api/plan 은 thin wrap 으로 backward compat 유지. molly-intake 의
// handleClarificationAnswer 도 같은 lib 호출 — plan emit ceremony 의
// single source of truth.
//
// ctx 로 designSystemRoot / requestSchemaPath 받음 — caller 가 server.js
// 의 module-level 상수 주입. 환경변수 DESIGN_SYSTEM_ROOT 도 fallback.
// API key 는 process.env 에서 직접 (server.js 와 동일 정책).

import path from 'node:path';
import fs from 'node:fs';

const DEFAULT_PLAN_MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You help PMs at Moloco plan UI changes for the MSM Portal.

You have access to a structured design system:
- patterns.json: composition patterns (app-shell, list-page, detail-page, form-basic, etc.)
- api-ui-contracts.json: entity definitions (Creative, Order, Advertiser, Product, AuctionOrder, PublisherTarget)
- pm-sa-request-schema.json: structured request contract with a change_intent enum

Your task: given a PM's goal, output a concrete plan as JSON. Ground your plan in real patterns, entities, and file paths from the DS resources provided.

## Grounding rules (strict)
- ONLY reference pattern_id values that exist in patterns.json. Never invent a pattern name.
- ONLY reference entity names that exist in api-ui-contracts.json. Use null if unsure.
- ONLY reference feature flag names, route keys, i18n keys, and component names that appear in the provided JSON. Never invent them.
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

Output MUST be valid JSON only (no markdown, no prose). Schema:
{
  "intent": "<one of: copy_update|spacing_adjustment|token_alignment|component_swap|layout_adjustment|state_handling|accessibility_improvement|new_page|new_feature|data_display_change|form_field_addition|bulk_operation>",
  "target_entity": "<Creative|Order|Advertiser|Product|AuctionOrder|PublisherTarget|null>",
  "summary": "<1-2 sentence summary of what will change, in Korean>",
  "visual_constraints": ["<string>", "..."],
  "plan_items": [
    {
      "id": "<unique kebab-case id>",
      "title": "<Short action description in Korean>",
      "description": "<1-2 sentence technical detail in Korean>",
      "pattern_id": "<pattern id from patterns.json or null>",
      "target_file": "<relative file path or template form from patterns.json, or null>",
      "depends_on": []
    }
  ]
}

Generate 3-8 plan items covering the full scope — nav changes, route registration, i18n keys, container/component files, feature flags, etc.`;

/**
 * Plan emit — PRD goal 을 받아 DS 기반 구조화된 plan 반환.
 *
 * @param {string|object} args — string = goal 만, object = { goal, client?, routeOrPage?, jiraUrl?, prdUrl? }
 * @param {object} [ctx] — { designSystemRoot, requestSchemaPath }
 * @returns {Promise<object>} plan — { intent, target_entity, summary, visual_constraints, plan_items }
 * @throws {Error} `emitPlan: <reason>` — caller 는 메시지로 분기 (required / not configured / LLM error / invalid JSON)
 */
export async function emitPlan(args, ctx = {}) {
  const goal = typeof args === 'string' ? args : args?.goal;
  if (!goal || typeof goal !== 'string' || !goal.trim()) {
    throw new Error('emitPlan: goal required');
  }
  const client = (typeof args === 'object' && args?.client) || ctx.client || 'msm-default';
  const routeOrPage = (typeof args === 'object' && args?.routeOrPage) || ctx.routeOrPage || '/';
  const jiraUrl = (typeof args === 'object' ? args.jiraUrl : null) || null;
  const prdUrl = (typeof args === 'object' ? args.prdUrl : null) || null;

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
  const patterns = readJsonSafe(patternsPath, {});
  const apiContracts = readJsonSafe(apiContractsPath, {});
  const requestSchema = readJsonSafe(requestSchemaPath, {});

  const userPrompt = `PM 요청:
Goal: ${goal}
Client: ${client}
Target page: ${routeOrPage}
${jiraUrl ? `Jira: ${jiraUrl}\n` : ''}${prdUrl ? `PRD: ${prdUrl}\n` : ''}
---

pm-sa-request-schema:
${JSON.stringify(requestSchema, null, 2)}

---

patterns.json:
${JSON.stringify(patterns, null, 2)}

---

api-ui-contracts.json:
${JSON.stringify(apiContracts, null, 2)}

---

위 DS 리소스를 근거로 계획을 JSON으로 출력하세요.`;

  const model = process.env.PLAN_MODEL || DEFAULT_PLAN_MODEL;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    console.error(`[plan-emitter] LLM ${resp.status}: ${errText.slice(0, 400)}`);
    throw new Error(`emitPlan: LLM error ${resp.status}`);
  }

  const result = await resp.json();
  const text = (result.content?.[0]?.text || '').trim();
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

  console.log(`[plan-emitter] Generated ${plan.plan_items?.length || 0} items for client=${client} route=${routeOrPage}`);
  return plan;
}

function readJsonSafe(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

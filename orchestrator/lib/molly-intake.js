// orchestrator/lib/molly-intake.js
//
// Unified intake — surface-agnostic entry point. Routes by classifier kind.
// For code_change, also runs the PRD analyzer to determine clarity. All
// surfaces (Slack / Chrome ext / Playground / curl) receive the same result shape.
//
// Phase 2 of unified intake (docs/superpowers/plans/2026-04-30-unified-intake.md).
// Wraps the existing 4 libs (classifier / chat / status / prd-analyzer) without
// adding new logic.
//
// Phase 3 Task 3.1 sub-phase A (2026-04-30): history-aware dispatcher
// skeleton. When ctx.history is present, routes based on the previous
// assistant.kind — prev=code_change_ambiguous / plan_emit implemented in
// sub-phase B (TODO throw). First-turn flow extracted into handleFirstTurn;
// compresses history into recentMessages so chat/status/classifier can use context.

import { classifyMollyText } from './molly-classifier.js';
import { composeChatReply } from './molly-chat.js';
import { composeStatusReply } from './molly-status.js';
import { composeLifecycleReply } from './molly-lifecycle.js';
import { analyzePrdClarity } from './molly-prd-analyzer.js';

/**
 * @typedef {'chat'|'status_query'|'lifecycle_action'|'code_change_clear'|'code_change_ambiguous'|'plan_emit'|'job_dispatched'|'plan_feedback'} IntakeKind
 *
 * - chat / status_query / code_change_clear / code_change_ambiguous: first-turn flow
 * - lifecycle_action: job lifecycle command (cancel/retry/etc.). Deterministic template response (no LLM)
 * - plan_emit: plan items returned after clarification completes (sub-phase B)
 * - job_dispatched: user approved the plan → signal for caller to invoke createJob (sub-phase B)
 */

/**
 * @typedef {object} HistoryTurn
 * @property {'user'|'assistant'} role
 * @property {string} content
 * @property {IntakeKind} [kind]                 // assistant turns only — the last IntakeResult.kind
 * @property {string} [clarifyingQuestion]       // assistant.kind=code_change_ambiguous
 * @property {Array<object>} [planItems]         // assistant.kind=plan_emit
 */

/**
 * @typedef {object} IntakeResult
 * @property {IntakeKind} kind
 * @property {string} reason  // one-line reason from the classifier or dispatcher
 * @property {string} [response]  // reply body for chat / status_query
 * @property {string} [clarifyingQuestion]  // next question when code_change_ambiguous
 * @property {string[]} [missingInfo]  // missing information when code_change_ambiguous
 * @property {Array<object>} [planItems]  // plan items when plan_emit
 * @property {string} [cumulativePrd]  // PRD assembled from history when plan_emit / job_dispatched
 * @property {string} [jobId]  // when job_dispatched (filled in by caller before responding)
 * @property {object} [meta]  // extension slot for future size/scope analysis etc.
 */

/**
 * Single entry point. If there is no history or the previous kind is
 * "open-ended" (chat/status), takes the first-turn flow. If the previous
 * kind is "in-flight" (code_change_ambiguous/plan_emit), dispatches to the
 * appropriate handler.
 *
 * Fallback policy on analysis failure:
 * - classifier failure → 'chat' (not creating a job has zero side effects). Handled inside the lib.
 * - prd-analyzer failure → 'clear' (a bad clarify failure would cause an infinite loop).
 *   Handled inside the lib.
 *
 * @param {string} text — user input (after mention strip and other cleanup)
 * @param {object} [ctx] — { surface, recentMessages, channel, threadTs, listJobs, getJob, history }
 * @returns {Promise<IntakeResult>}
 */
export async function processIntake(text, ctx = {}) {
  const history = Array.isArray(ctx.history) ? ctx.history : [];
  const prev = lastAssistantTurn(history);

  // First turn or prev is an open-ended kind (chat/status) — start a new dispatcher cycle.
  // History is still reused as context (compressed and injected into recentMessages).
  if (!prev || prev.kind === 'chat' || prev.kind === 'status_query') {
    return await handleFirstTurn(text, ctx, history);
  }

  switch (prev.kind) {
    case 'code_change_ambiguous':
      return await handleClarificationAnswer(text, history, ctx);
    case 'plan_emit':
      return await handlePlanEdit(text, history, ctx);
    case 'code_change_clear':
    case 'job_dispatched':
      // After a job was created — treat as free chat (user may submit a new PRD or ask for job status).
      return await handleFirstTurn(text, ctx, history);
    default:
      return await handleFirstTurn(text, ctx, history);
  }
}

/**
 * First-turn flow — routes by classifier kind. When history is present,
 * compresses it into recentMessages so chat/status/classifier can use
 * context (e.g. chat replies remember the previous conversation).
 *
 * @param {string} text
 * @param {object} ctx
 * @param {HistoryTurn[]} history
 * @returns {Promise<IntakeResult>}
 */
async function handleFirstTurn(text, ctx, history) {
  // Compress only the last 3 turns of history — saves token cost. If
  // ctx.recentMessages is already provided explicitly, prefer that.
  const recentMessages = ctx.recentMessages?.length
    ? ctx.recentMessages
    : history.slice(-3).map((t) => `${t.role === 'user' ? '사용자' : 'molly'}: ${(t.content || '').slice(0, 200)}`);
  const enrichedCtx = { ...ctx, recentMessages };

  // 2026-05-19 — optional progress callback. Surfaces (Slack) wire this to a
  // single status message and update it as the pipeline advances, so users
  // don't see 60-90s of silence between the initial "One moment…" and the
  // plan card. Fire-and-forget — failure must not break the main flow.
  const fireProgress = async (stage, info = {}) => {
    const cb = ctx.onProgress;
    if (typeof cb !== 'function') return;
    try { await cb(stage, info); } catch { /* swallow */ }
  };

  const cls = await classifyMollyText(text, enrichedCtx);

  if (cls.kind === 'chat') {
    const response = await composeChatReply(text, enrichedCtx);
    return { kind: 'chat', reason: cls.reason, response };
  }

  if (cls.kind === 'status_query') {
    const response = await composeStatusReply(text, enrichedCtx);
    return { kind: 'status_query', reason: cls.reason, response };
  }

  // #4 (2026-05-06) — lifecycle_action branch. New category. The lifecycle lib
  // uses a deterministic template (no LLM call) — identifies the job and
  // provides surface-specific UI guidance.
  if (cls.kind === 'lifecycle_action') {
    const response = await composeLifecycleReply(text, enrichedCtx);
    return { kind: 'lifecycle_action', reason: cls.reason, response };
  }

  // plan_feedback (2026-05-11) — user requests a natural-language revision
  // while a plan card is up. No LLM call here — the caller (Slack / Playground
  // / Chrome ext) re-invokes emitPlan(previousPlan, feedback) in its own
  // context and swaps the card. intake only passes the kind and returns the
  // user text as feedback.
  if (cls.kind === 'plan_feedback') {
    return {
      kind: 'plan_feedback',
      reason: cls.reason,
      feedback: text,
    };
  }

  // code_change → PRD analyzer
  await fireProgress('analyzing_prd');
  const analysis = await analyzePrdClarity(text, enrichedCtx);
  if (analysis.clarity === 'ambiguous') {
    return {
      kind: 'code_change_ambiguous',
      reason: cls.reason,
      clarifyingQuestion: analysis.clarifyingQuestion,
      missingInfo: analysis.missingInfo,
    };
  }

  // PRD is clear on the first turn — bundle emitPlan into the same response.
  // When the client receives plan_emit, it shows the plan card. If emitPlan
  // fails, fall back safely to code_change_clear + cumulativePrd (caller can
  // call createJob directly). The old behaviour returned only code_change_clear
  // without calling emitPlan — the client would say "plan will be emitted
  // shortly" but the plan never arrived (dead-end).
  await fireProgress('drafting_plan');
  const cumulativePrd = text;
  let plan;
  try {
    const { emitPlan } = await import('./molly-plan-emitter.js');
    plan = await emitPlan(cumulativePrd, enrichedCtx);
  } catch (err) {
    console.warn(
      `[molly-intake] emitPlan failed (first-turn): ${err.message?.slice(0, 120)} — falling back to code_change_clear`,
    );
    return {
      kind: 'code_change_clear',
      reason: `clear but plan emit failed: ${err.message?.slice(0, 80)}`,
      cumulativePrd,
    };
  }
  return {
    kind: 'plan_emit',
    reason: cls.reason,
    cumulativePrd,
    planItems: plan?.plan_items ?? [],
    plan,
  };
}

/**
 * Sub-phase B.3 (2026-04-30) — handles prev=code_change_ambiguous.
 * Builds a cumulative PRD and re-evaluates with prd-analyzer + history.
 * - still ambiguous → next clarifying question
 * - clear → returns code_change_clear + cumulativePrd (caller uses
 *   cumulativePrd when calling createJob)
 *
 * Sub-phase B.2 (plan-emitter extraction) is next session. Until then,
 * skips plan_emit and returns code_change_clear directly — user can create
 * the job immediately. Wizard plan ceremony integration requires
 * sub-phase B.2+B.4+C to be complete.
 *
 * @param {string} text
 * @param {HistoryTurn[]} history
 * @param {object} ctx
 * @returns {Promise<IntakeResult>}
 */
async function handleClarificationAnswer(text, history, ctx) {
  const analysis = await analyzePrdClarity(text, { ...ctx, history });
  console.log(`[molly-intake] clarification answer → clarity=${analysis.clarity} (text="${text.slice(0, 60)}")`);
  if (analysis.clarity === 'ambiguous') {
    return {
      kind: 'code_change_ambiguous',
      reason: 'follow-up answer still ambiguous',
      clarifyingQuestion: analysis.clarifyingQuestion,
      missingInfo: analysis.missingInfo,
    };
  }
  // Clear — cumulative PRD + plan emit (sub-phase B.2). Falls back to
  // code_change_clear if emitPlan fails (caller can call createJob directly
  // with cumulativePrd).
  const cumulativePrd = compactCumulativePrd(history, text);
  let plan;
  try {
    const { emitPlan } = await import('./molly-plan-emitter.js');
    plan = await emitPlan(cumulativePrd, ctx);
  } catch (err) {
    console.warn(`[molly-intake] emitPlan failed (clarification): ${err.message?.slice(0, 120)} — falling back to code_change_clear`);
    return {
      kind: 'code_change_clear',
      reason: `clarified but plan emit failed: ${err.message?.slice(0, 80)}`,
      cumulativePrd,
    };
  }
  return {
    kind: 'plan_emit',
    reason: 'clarified, plan ready',
    cumulativePrd,
    planItems: plan?.plan_items ?? [],
    plan,
  };
}

/**
 * Combines all user turns in history with the latest text into a single PRD.
 * The caller (Slack/Chrome ext/Playground) should prefer cumulativePrd when
 * calling createJob. Clarifying questions from assistant turns are used only
 * as context and are NOT included in the PRD (keeping it to user intent only).
 *
 * @param {HistoryTurn[]} history
 * @param {string} latestText
 * @returns {string}
 */
function compactCumulativePrd(history, latestText) {
  const userTurns = history
    .filter((t) => t?.role === 'user')
    .map((t) => (t.content || '').trim())
    .filter(Boolean);
  return [...userTurns, latestText].join('\n\n').trim();
}

/**
 * Sub-phase B.4 (2026-04-30) — handles prev=plan_emit when the user has
 * seen the plan and either approves it or provides free-form feedback.
 *
 * - APPROVE heuristic match → kind=job_dispatched. The caller (server/surface)
 *   calls createJob with cumulativePrd + planItems. This lib is stateless —
 *   it does not create the job.
 * - Free-form feedback → re-invokes emitPlan with cumulativePrd +
 *   "[추가 피드백]" (additional feedback marker) + user text → kind=plan_emit (re-emit).
 *
 * @param {string} text
 * @param {HistoryTurn[]} history
 * @param {object} ctx
 * @returns {Promise<IntakeResult>}
 */
async function handlePlanEdit(text, history, ctx) {
  const trimmed = text.trim();
  if (APPROVE_RE.test(trimmed)) {
    // Approved — caller calls createJob. lib only provides the signal + cumulative PRD/planItems.
    const prev = lastAssistantTurn(history);
    const cumulativePrd = compactCumulativePrd(history, '');
    console.log(`[molly-intake] plan_emit → job_dispatched (approve match: "${trimmed.slice(0, 40)}")`);
    return {
      kind: 'job_dispatched',
      reason: 'user approved plan',
      cumulativePrd,
      planItems: prev?.planItems ?? [],
    };
  }
  // Free-form feedback → plan re-emit. Previous PRD + "[추가 피드백]" marker + user text.
  const baseCumulative = compactCumulativePrd(history, '');
  const cumulativePrd = baseCumulative
    ? `${baseCumulative}\n\n[추가 피드백]\n${trimmed}`
    : trimmed;
  console.log(`[molly-intake] plan_emit → re-emit (feedback: "${trimmed.slice(0, 40)}")`);
  let plan;
  try {
    const { emitPlan } = await import('./molly-plan-emitter.js');
    plan = await emitPlan(cumulativePrd, ctx);
  } catch (err) {
    console.warn(`[molly-intake] emitPlan failed (plan edit): ${err.message?.slice(0, 120)}`);
    return {
      kind: 'code_change_clear',
      reason: `plan re-emit failed: ${err.message?.slice(0, 80)}`,
      cumulativePrd,
    };
  }
  return {
    kind: 'plan_emit',
    reason: 'plan revised per feedback',
    cumulativePrd,
    planItems: plan?.plan_items ?? [],
    plan,
  };
}

// General approval expressions ("proceed as-is / go ahead / approve / ok / yes" etc.).
// Matches only when the user gives a short reply after seeing the plan card.
// Longer responses or mixed words are treated as free-form feedback.
const APPROVE_RE = /^(이대로( 진행)?|진행( 해줘|해)?|승인|approve|ok|okay|네|네\.|예|예\.|yes)\.?$/i;

/**
 * The last assistant turn in history. Returns null if none exists.
 *
 * @param {HistoryTurn[]} history
 * @returns {HistoryTurn | null}
 */
function lastAssistantTurn(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.role === 'assistant') return history[i];
  }
  return null;
}

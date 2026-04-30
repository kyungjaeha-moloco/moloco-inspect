// orchestrator/lib/molly-intake.js
//
// Unified intake — surface 무관 entry point. classifier → kind 별 분기.
// code_change 면 PRD analyzer 도 거쳐 clarity 까지 결정. 모든 surface
// (Slack / Chrome ext / Playground / curl) 가 같은 결과 shape 받음.
//
// Phase 2 of unified intake (docs/superpowers/plans/2026-04-30-unified-intake.md).
// 새 로직 추가 없이 기존 4 lib (classifier / chat / status / prd-analyzer) wrap.
//
// Phase 3 Task 3.1 sub-phase A (2026-04-30): history-aware dispatcher
// skeleton. ctx.history 가 있으면 직전 assistant.kind 별 routing —
// prev=code_change_ambiguous / plan_emit 은 sub-phase B 에서 구현
// (TODO throw). 첫 턴 흐름은 handleFirstTurn 으로 추출, recentMessages
// 에 history 압축 주입해서 chat/status/classifier 가 컨텍스트 활용.

import { classifyMollyText } from './molly-classifier.js';
import { composeChatReply } from './molly-chat.js';
import { composeStatusReply } from './molly-status.js';
import { analyzePrdClarity } from './molly-prd-analyzer.js';

/**
 * @typedef {'chat'|'status_query'|'code_change_clear'|'code_change_ambiguous'|'plan_emit'|'job_dispatched'} IntakeKind
 *
 * - chat / status_query / code_change_clear / code_change_ambiguous: 첫 턴 흐름
 * - plan_emit: clarification 끝나고 plan items 반환 (sub-phase B)
 * - job_dispatched: 사용자가 plan 승인 → caller 가 createJob 부르는 시그널 (sub-phase B)
 */

/**
 * @typedef {object} HistoryTurn
 * @property {'user'|'assistant'} role
 * @property {string} content
 * @property {IntakeKind} [kind]                 // assistant turn 만 — 마지막 IntakeResult.kind
 * @property {string} [clarifyingQuestion]       // assistant.kind=code_change_ambiguous
 * @property {Array<object>} [planItems]         // assistant.kind=plan_emit
 */

/**
 * @typedef {object} IntakeResult
 * @property {IntakeKind} kind
 * @property {string} reason  // classifier 또는 dispatcher 가 준 한 줄 이유
 * @property {string} [response]  // chat / status_query 의 답변 본문
 * @property {string} [clarifyingQuestion]  // code_change_ambiguous 시 다음 질문
 * @property {string[]} [missingInfo]  // code_change_ambiguous 시 빠진 정보
 * @property {Array<object>} [planItems]  // plan_emit 시 plan 항목
 * @property {string} [cumulativePrd]  // plan_emit / job_dispatched 시 history 합친 PRD
 * @property {string} [jobId]  // job_dispatched 시 (caller 가 채워서 응답)
 * @property {object} [meta]  // 향후 size/scope 분석 등 확장 슬롯
 */

/**
 * 단일 entry point. history 가 없거나 prev kind 가 chat/status 같은
 * "open-ended" 면 첫 턴 흐름. prev=code_change_ambiguous/plan_emit 같은
 * "in-flight" 상태면 그에 맞는 핸들러로 dispatch.
 *
 * 분석 실패 폴백 정책:
 * - classifier 실패 → 'chat' (잡 안 만드는 게 부작용 0). lib 내부에서 처리.
 * - prd-analyzer 실패 → 'clear' (clarify 가 잘못 fail 하면 무한 루프).
 *   lib 내부에서 처리.
 *
 * @param {string} text — 사용자 입력 (mention strip 등 cleanup 후)
 * @param {object} [ctx] — { surface, recentMessages, channel, threadTs, listJobs, getJob, history }
 * @returns {Promise<IntakeResult>}
 */
export async function processIntake(text, ctx = {}) {
  const history = Array.isArray(ctx.history) ? ctx.history : [];
  const prev = lastAssistantTurn(history);

  // 첫 턴이거나 prev 가 open-ended kind (chat/status) — 새 dispatcher 사이클.
  // history 자체는 컨텍스트로 재사용 (recentMessages 에 압축 주입).
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
      // 잡 만들어진 후 — 자유 chat 처럼 처리 (사용자가 새 PRD 던질 수도, 잡 상태 물을 수도).
      return await handleFirstTurn(text, ctx, history);
    default:
      return await handleFirstTurn(text, ctx, history);
  }
}

/**
 * 첫 턴 흐름 — classifier → kind 별 분기. history 가 있으면 recentMessages
 * 에 압축 주입해서 chat/status/classifier 가 컨텍스트 활용 (예: chat
 * 응답이 직전 대화 기억하게).
 *
 * @param {string} text
 * @param {object} ctx
 * @param {HistoryTurn[]} history
 * @returns {Promise<IntakeResult>}
 */
async function handleFirstTurn(text, ctx, history) {
  // history 마지막 3 turn 만 압축 — 토큰 비용 절약. 이미 ctx.recentMessages 가
  // 명시 주어졌으면 그걸 우선.
  const recentMessages = ctx.recentMessages?.length
    ? ctx.recentMessages
    : history.slice(-3).map((t) => `${t.role === 'user' ? '사용자' : 'molly'}: ${(t.content || '').slice(0, 200)}`);
  const enrichedCtx = { ...ctx, recentMessages };

  const cls = await classifyMollyText(text, enrichedCtx);

  if (cls.kind === 'chat') {
    const response = await composeChatReply(text, enrichedCtx);
    return { kind: 'chat', reason: cls.reason, response };
  }

  if (cls.kind === 'status_query') {
    const response = await composeStatusReply(text, enrichedCtx);
    return { kind: 'status_query', reason: cls.reason, response };
  }

  // code_change → PRD analyzer
  const analysis = await analyzePrdClarity(text, enrichedCtx);
  if (analysis.clarity === 'ambiguous') {
    return {
      kind: 'code_change_ambiguous',
      reason: cls.reason,
      clarifyingQuestion: analysis.clarifyingQuestion,
      missingInfo: analysis.missingInfo,
    };
  }

  return {
    kind: 'code_change_clear',
    reason: cls.reason,
  };
}

/**
 * Sub-phase B.3 (2026-04-30) — prev=code_change_ambiguous 시 처리.
 * cumulative PRD 만들어 prd-analyzer 가 history 와 함께 다시 판정.
 * - 여전히 ambiguous → 다음 clarifying Q
 * - clear → code_change_clear + cumulativePrd 반환 (caller 가 createJob
 *   할 때 cumulativePrd 사용)
 *
 * Sub-phase B.2 (plan-emitter 추출) 가 다음 세션. 그 전엔 plan_emit
 * 안 거치고 직접 code_change_clear 로 — 사용자가 즉시 잡 만들 수 있음.
 * Wizard 의 plan ceremony 통합은 sub-phase B.2+B.4+C 끝나야 완성.
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
  // Clear — cumulative PRD + plan emit (sub-phase B.2). emitPlan 실패
  // 시 code_change_clear 폴백 (caller 가 cumulativePrd 로 직접 createJob).
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
 * History 의 모든 user turn + 최신 텍스트를 하나의 PRD 로 합침.
 * caller (Slack/Chrome ext/Playground) 가 createJob 할 때 cumulativePrd
 * 우선 사용. assistant turn 의 clarifying Q 들은 컨텍스트로만 PRD 에는
 * 포함 X (PRD 는 사용자 의도만 담는 게 깨끗).
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
 * Sub-phase B.4 (2026-04-30) — prev=plan_emit 일 때 사용자가 plan 을 보고
 * "이대로 진행" / 자유 피드백 한 것 처리.
 *
 * - APPROVE 휴리스틱 매칭 → kind=job_dispatched. caller (서버/surface) 가
 *   cumulativePrd + planItems 로 createJob 부름. lib 은 stateless — 잡
 *   생성 안 함.
 * - 자유 피드백 → cumulativePrd + "[추가 피드백]" + 사용자 텍스트로
 *   emitPlan 재호출 → kind=plan_emit (재출력).
 *
 * @param {string} text
 * @param {HistoryTurn[]} history
 * @param {object} ctx
 * @returns {Promise<IntakeResult>}
 */
async function handlePlanEdit(text, history, ctx) {
  const trimmed = text.trim();
  if (APPROVE_RE.test(trimmed)) {
    // 승인 — caller 가 createJob. lib 은 시그널 + 누적 PRD/planItems 만.
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
  // 자유 피드백 → plan re-emit. 이전 PRD + "[추가 피드백]" + 사용자 텍스트.
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

// "이대로 / 진행 / 승인 / approve / ok / 네 / 예 / yes" 류 일반적 승인
// 표현. plan 카드 보고 사용자가 짧게 답할 때만 매칭. 길거나 다른 단어
// 섞이면 자유 피드백으로.
const APPROVE_RE = /^(이대로( 진행)?|진행( 해줘|해)?|승인|approve|ok|okay|네|네\.|예|예\.|yes)\.?$/i;

/**
 * History 의 마지막 assistant turn. 없으면 null.
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

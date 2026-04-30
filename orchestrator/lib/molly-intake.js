// orchestrator/lib/molly-intake.js
//
// Unified intake — surface 무관 entry point. classifier → kind 별 분기.
// code_change 면 PRD analyzer 도 거쳐 clarity 까지 결정. 모든 surface
// (Slack / Chrome ext / Playground / curl) 가 같은 결과 shape 받음.
//
// Phase 2 of unified intake (docs/superpowers/plans/2026-04-30-unified-intake.md).
// 새 로직 추가 없이 기존 4 lib (classifier / chat / status / prd-analyzer) wrap.

import { classifyMollyText } from './molly-classifier.js';
import { composeChatReply } from './molly-chat.js';
import { composeStatusReply } from './molly-status.js';
import { analyzePrdClarity } from './molly-prd-analyzer.js';

/**
 * @typedef {object} IntakeResult
 * @property {'chat'|'status_query'|'code_change_clear'|'code_change_ambiguous'} kind
 * @property {string} reason  // classifier 가 준 한 줄 이유
 * @property {string} [response]  // chat / status_query 의 답변 본문
 * @property {string} [clarifyingQuestion]  // code_change_ambiguous 시 다음 질문
 * @property {string[]} [missingInfo]  // code_change_ambiguous 시 빠진 정보
 * @property {object} [meta]  // 향후 size/scope 분석 등 확장 슬롯
 */

/**
 * 단일 entry point. classifier 가 kind 결정, code_change 는 PRD analyzer 를
 * 추가로 거쳐 clear / ambiguous 까지 분기.
 *
 * 분석 실패 폴백 정책:
 * - classifier 실패 → 'chat' (잡 안 만드는 게 부작용 0). lib 내부에서 처리.
 * - prd-analyzer 실패 → 'clear' (clarify 가 잘못 fail 하면 무한 루프).
 *   lib 내부에서 처리.
 *
 * @param {string} text — 사용자 입력 (mention strip 등 cleanup 후)
 * @param {object} [ctx] — { surface, recentMessages, channel, threadTs, listJobs, getJob }
 * @returns {Promise<IntakeResult>}
 */
export async function processIntake(text, ctx = {}) {
  const cls = await classifyMollyText(text, ctx);

  if (cls.kind === 'chat') {
    const response = await composeChatReply(text, ctx);
    return { kind: 'chat', reason: cls.reason, response };
  }

  if (cls.kind === 'status_query') {
    const response = await composeStatusReply(text, ctx);
    return { kind: 'status_query', reason: cls.reason, response };
  }

  // code_change → PRD analyzer
  const analysis = await analyzePrdClarity(text, ctx);
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

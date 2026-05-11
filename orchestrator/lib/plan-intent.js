// orchestrator/lib/plan-intent.js
//
// plan-emitter intent → fast-track 분기 판정. agent 가 plan_items 만 받아
// 바로 코딩 가능한 단순 변경 ↔ decomposer 가 필요한 복잡 변경.
//
// Fast-track 적용: copy_update / spacing_adjustment / token_alignment /
//                  accessibility_improvement / state_handling
// Full path (decomposer 실행): 그 외 모든 intent.
//
// 사용 위치:
//   - server.js: createJob 호출 시 isFastTrackIntent(plan.intent) → skipDecomposer
//   - molly.js (Slack): plan_items 카드 헤더에 "빠른 실행" 배지 표시
//   - chrome-extension/sidepanel.js: 동일
//   - playground-app/src/editor/AIPanel.tsx: 동일 (TS 쪽은 enum 별도 정의)

export const FAST_TRACK_INTENTS = new Set([
  'copy_update',
  'spacing_adjustment',
  'token_alignment',
  'accessibility_improvement',
  'state_handling',
]);

/**
 * @param {string|undefined|null} intent — plan.intent 값
 * @returns {boolean}
 */
export function isFastTrackIntent(intent) {
  return typeof intent === 'string' && FAST_TRACK_INTENTS.has(intent);
}

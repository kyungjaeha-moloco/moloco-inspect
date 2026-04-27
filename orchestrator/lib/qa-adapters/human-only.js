/**
 * `human_only` adapter — the strategist picked "사람이 직접 확인" so
 * there's nothing to automate. Return passed:true so the UI can show
 * "자동 단계 끝났음, 이제 사람 차례". The real gate is the manual
 * `markQaPass` button which still flips qa→complete.
 *
 * @returns {Promise<{ passed: boolean, notes: string }>}
 */
export async function humanOnly() {
  return { passed: true, notes: '사람이 직접 확인하는 전략입니다' };
}

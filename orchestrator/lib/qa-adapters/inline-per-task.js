/**
 * `inline_per_task` adapter — STUB for v1.
 *
 * The intended shape is to fire a smoke run after each task review
 * passes, not just at the end. Requires hooking inside
 * `job-runner.js#runJob` and tracking per-task targetRoute (most tasks
 * don't change a route — only the final one does). Out of scope for
 * v1; falls back to "passed:true with note" so the UI doesn't show a
 * red banner just because we haven't built it yet.
 */
export async function inlinePerTask() {
  return {
    passed: true,
    notes: 'inline_per_task 자동 검증은 아직 구현되지 않았습니다 (사람이 확인해주세요)',
  };
}

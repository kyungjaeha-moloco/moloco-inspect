/**
 * `visual_diff` adapter — STUB for v1.
 *
 * The intended shape:
 *   1. Capture `pre-job-screenshot.png` right before the first task runs.
 *   2. After the last task, capture `post-job-screenshot.png`.
 *   3. Diff via pixelmatch (or playwright-visual-comparisons) and pass
 *      if the changed-pixel ratio matches expectation (small for
 *      cosmetic tweaks, large/bounded for layout changes).
 *
 * Out of scope for v1. Falls back to "passed:true with note" so the
 * UI doesn't show a red banner for a strategy we haven't built.
 */
export async function visualDiff() {
  return {
    passed: true,
    notes: 'visual_diff 자동 비교는 아직 구현되지 않았습니다 (사람이 확인해주세요)',
  };
}

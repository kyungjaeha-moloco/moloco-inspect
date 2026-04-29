/**
 * QA strategy runner (J6 execution).
 *
 * Strategist decides WHAT strategy fits the job (already shipped in
 * `job-qa-strategist.js`). This module DOES the run — dispatches to
 * the matching per-strategy adapter under `qa-adapters/`, returns a
 * uniform `{passed, notes, evidence?}` shape, and stamps the result
 * onto the job via `setQaAutoResult`.
 *
 * Design contract:
 *   - Each adapter returns `{passed: boolean, notes: string,
 *     evidence?: object}`. Never throws — they catch internally and
 *     translate to passed:false with a note.
 *   - This dispatcher catches anything an adapter does throw (defense
 *     in depth) so a buggy adapter can never crash the orchestrator.
 *   - Result is stamped on the job; no FSM transition. The manual
 *     `markQaPass` button is still the human gate that flips qa →
 *     complete. Auto-pass is informational, not promotional.
 *
 * Strategy mapping comes from `QA_STRATEGIES` in
 * `job-qa-strategist.js`. Adding a new strategy id requires:
 *   1. Append to `QA_STRATEGIES` catalog.
 *   2. Add adapter file under `qa-adapters/`.
 *   3. Wire it into `ADAPTERS` here.
 *   4. Update the UI label/tooltip in `QaStrategyChip`.
 */

import { getJob, setQaAutoResult } from './job.js';
import { getPlayground } from './playground.js';
import { humanOnly } from './qa-adapters/human-only.js';
import { finalRouteSmoke } from './qa-adapters/final-route-smoke.js';
import { lintOnly } from './qa-adapters/lint-only.js';
import { inlinePerTask } from './qa-adapters/inline-per-task.js';
import { visualDiff } from './qa-adapters/visual-diff.js';
import { agentReview } from './qa-adapters/agent-review.js';

/** @type {Record<string, (job: any, pg: any) => Promise<{passed: boolean, notes: string, evidence?: object}>>} */
const ADAPTERS = {
  human_only: humanOnly,
  final_route_smoke: finalRouteSmoke,
  lint_only: lintOnly,
  inline_per_task: inlinePerTask,
  visual_diff: visualDiff,
  agent_review: agentReview,
};

/**
 * @param {string} jobId
 * @returns {Promise<{ passed: boolean, notes: string, strategy: string } | null>}
 */
export async function runQaStrategy(jobId) {
  const job = getJob(jobId);
  if (!job) return null;
  const strategy = job.qaStrategy ?? 'human_only';
  const adapter = ADAPTERS[strategy] ?? ADAPTERS.human_only;
  const pg = getPlayground(job.playgroundId);

  /** @type {{ passed: boolean, notes: string, evidence?: object }} */
  let result;
  try {
    result = await adapter(job, pg);
    if (!result || typeof result.passed !== 'boolean') {
      result = {
        passed: false,
        notes: `어댑터(${strategy})가 형식에 맞지 않는 결과를 반환했습니다`,
      };
    }
  } catch (err) {
    // Adapters shouldn't throw — but if one does, don't poison the job.
    console.error(`[qa-runner] ${jobId} ${strategy} threw:`, err);
    result = {
      passed: false,
      notes: `자동 QA 어댑터(${strategy}) 예외: ${err.message?.slice(0, 120) ?? String(err).slice(0, 120)}`,
    };
  }

  const stamped = {
    strategy,
    passed: result.passed,
    notes: result.notes,
    ranAt: Date.now(),
    ...(result.evidence ? { evidence: result.evidence } : {}),
  };
  setQaAutoResult(jobId, stamped);
  return { passed: result.passed, notes: result.notes, strategy };
}

/**
 * Fire-and-forget version for the runner-finished hook in server.js.
 * Mirrors `decomposeJobInBackground`: catches errors, never throws,
 * stamps a fallback failure-result if the runner module itself blows
 * up so the UI doesn't sit waiting forever.
 *
 * @param {string} jobId
 */
export function runQaStrategyInBackground(jobId) {
  void (async () => {
    try {
      await runQaStrategy(jobId);
    } catch (err) {
      console.error(`[qa-runner] ${jobId} background hook failed:`, err);
      try {
        const job = getJob(jobId);
        setQaAutoResult(jobId, {
          strategy: job?.qaStrategy ?? 'human_only',
          passed: false,
          notes: `자동 QA 실행 실패: ${err.message?.slice(0, 120) ?? String(err).slice(0, 120)}`,
          ranAt: Date.now(),
        });
      } catch {
        // already logged above
      }
    }
  })();
}

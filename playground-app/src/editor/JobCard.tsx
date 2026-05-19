/**
 * JobCard — inline live-updating job view rendered inside a chat bubble.
 *
 * Plan: docs/superpowers/plans/2026-04-24-prd-to-delivery-thin-slice-v2.md
 *
 * Replaces the standalone `/j/:jobId` page route with an in-chat
 * experience. Polls `GET /api/job/:id` every 2s (no SSE in v0), renders
 * task status + review notes + the minimum controls (approve / retry /
 * skip / unblock / mark-qa-pass / cancel / re-decompose / promote).
 *
 * Stays within the AIPanel's visual idiom — message bubble width,
 * design-system tokens — so it reads as a rich assistant message,
 * not a popped-out page.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  Job,
  JobTask,
  QaStrategyId,
} from '../services/orchestrator-client';
import { usePlaygroundStore } from '../store/playground-store';
import {
  getJob,
  approveJobPlan,
  retryJobTask,
  acceptJobTask,
  skipJobTask,
  unblockJobTask,
  updateJobTasks,
  cancelJob,
  resumeJob,
  redecomposeJob,
  markQaPass,
  rerunJobQa,
} from '../services/orchestrator-client';
import {
  subscribeAgentStream,
  type AgentStreamSnapshot,
} from '../services/agent-stream';

const POLL_INTERVAL_MS = 2000;

/**
 * Subscribe to the agent's live SSE stream for a single task. Yields
 * null when the task is not in a live status, or before the snapshot
 * has any signal. Cleans up the EventSource when the task moves out
 * of `running` / `committed` or when the change-request id changes.
 */
function useAgentStream(
  changeRequestId: string | undefined,
  active: boolean,
): AgentStreamSnapshot | null {
  const [snap, setSnap] = useState<AgentStreamSnapshot | null>(null);
  useEffect(() => {
    if (!active || !changeRequestId) {
      setSnap(null);
      return;
    }
    setSnap(null); // fresh subscription = fresh counters
    const cleanup = subscribeAgentStream(changeRequestId, (next) => {
      setSnap(next);
    });
    return cleanup;
  }, [changeRequestId, active]);
  return snap;
}

export function JobCard({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  // Playground time-travel signal — when a user checks out an older sha
  // (or restores to a checkpoint), tasks committed after that point are
  // no longer reflected in the working tree. We dim them so the user
  // knows "this was done, but you rewound past it."
  const playgroundCheckedOutSha = usePlaygroundStore(
    (s) => s.current?.checkedOutSha ?? null,
  );
  const playgroundHeadSha = usePlaygroundStore(
    (s) => s.current?.headCommitSha ?? null,
  );
  const requestIframeNav = usePlaygroundStore((s) => s.requestIframeNav);

  const refresh = useCallback(async () => {
    try {
      const next = await getJob(jobId);
      setJob(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [jobId]);

  useEffect(() => {
    void refresh();
    // Only poll while the job is still moving. Complete/cancelled land
    // terminally — no point waking up the network every 2s forever.
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const runAction = useCallback(async (fn: () => Promise<Job>) => {
    setActing(true);
    try {
      const next = await fn();
      setJob(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActing(false);
    }
  }, []);

  if (!job && !error) {
    return <div style={containerStyle}>loading job…</div>;
  }
  if (!job) {
    return (
      <div style={containerStyle}>
        <div style={{ color: 'var(--text-danger, #d33)', fontSize: 12 }}>
          {error}
        </div>
      </div>
    );
  }

  const canApprove = job.status === 'planning' && job.tasks.length > 0;
  const canResume = job.status === 'paused';
  const canQaPass = job.status === 'qa';
  const canPromote = job.status === 'complete';
  const canCancel =
    job.status !== 'complete' && job.status !== 'cancelled';
  // Re-decompose is a recovery action — only meaningful after the
  // decomposer has *failed* (`paused` with the LLM error reason) or
  // the user has already approved a plan but wants a different break-
  // down (`planning`). Surfacing it during the live `decomposing`
  // window invites a panic click that would race the in-flight LLM
  // call.
  const canRedecompose =
    job.status === 'planning' ||
    (job.status === 'paused' && (job.pausedReason ?? '').startsWith('decompose failed'));

  const reviewedCount = job.tasks.filter((t) => t.status === 'reviewed').length;
  const skippedCount = job.tasks.filter((t) => t.status === 'skipped').length;
  // Plan v3 G1.5 — count review warnings (reviewed status + verdict='fail' +
  // severity='warning' or unset). Surfaced as a header badge so Phase 1 ships
  // with at least a coarse signal before the full final summary lands.
  const warningCount = job.tasks.filter(
    (t) =>
      t.status === 'reviewed' &&
      t.review?.verdict === 'fail' &&
      (t.review?.severity ?? 'warning') === 'warning',
  ).length;
  const dimmedIds = computeDimmedTaskIds(
    job.tasks,
    playgroundCheckedOutSha,
    playgroundHeadSha,
  );
  const inTimeTravel = dimmedIds.size > 0;
  const isCancelled = job.status === 'cancelled';

  return (
    <div
      style={{
        ...containerStyle,
        ...(isCancelled
          ? { opacity: 0.55, transition: 'opacity 120ms ease-out' }
          : null),
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
            job {job.id}
          </span>
          <StatusPill status={job.status} />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {reviewedCount}/{job.tasks.length - skippedCount} reviewed
            {skippedCount > 0 && ` · ${skippedCount} skipped`}
          </span>
          {warningCount > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'var(--bg-warn, #fff7e6)',
                color: 'var(--text-warn, #8a5a00)',
                border: '1px solid var(--border-warn, #f5c26b)',
              }}
              title="Review fired warnings on these tasks but the job auto-progressed (Plan v3 paradigm). Each warning task is marked with ⚠ below."
            >
              ⚠ {warningCount} review {warningCount === 1 ? 'warning' : 'warnings'}
            </span>
          )}
          {job.qaStrategy && (
            <QaStrategyChip
              strategy={job.qaStrategy}
              rationale={job.qaRationale ?? job.qaRationaleKo}
            />
          )}
        </div>
      </header>

      {job.prdText && (
        <details
          style={{
            marginBottom: 8,
            padding: '6px 8px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 4,
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: 11,
              userSelect: 'none',
            }}
          >
            📝 Original PRD
          </summary>
          <pre
            style={{
              marginTop: 6,
              marginBottom: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
              fontSize: 12,
              color: 'var(--text-primary)',
              maxHeight: 240,
              overflow: 'auto',
              lineHeight: 1.5,
            }}
          >
            {job.prdText}
          </pre>
        </details>
      )}

      {inTimeTravel && (
        <div
          style={{
            padding: '6px 8px',
            marginBottom: 8,
            background: 'rgba(245, 194, 107, 0.15)',
            border: '1px solid var(--border-warn, #f5c26b)',
            borderRadius: 4,
            fontSize: 11,
            color: 'var(--text-warn, #8a5a00)',
          }}
        >
          ⏮ You are viewing a past point — tasks executed after this are not reflected (dimmed below).
        </div>
      )}
      {job.pausedReason && (
        <div
          style={{
            padding: '6px 8px',
            marginBottom: 8,
            background: 'var(--bg-warn, #fff7e6)',
            border: '1px solid var(--border-warn, #f5c26b)',
            borderRadius: 4,
            fontSize: 11,
            color: 'var(--text-warn, #8a5a00)',
          }}
        >
          ⏸ {job.pausedReason}
        </div>
      )}

      <QaAutoResultBanner
        job={job}
        acting={acting}
        onRerun={() => runAction(() => rerunJobQa(job.id))}
      />


      {job.status === 'decomposing' && job.tasks.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            marginBottom: 8,
            background: 'rgba(20, 83, 182, 0.06)',
            border: '1px solid var(--text-info, #1453b6)',
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--text-info, #1453b6)',
            animation: 'jobTaskPulse 1.6s ease-in-out infinite',
          }}
        >
          <PixelAgentSprite />
          <span>
            <strong>Re-planning…</strong>
            <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: 'var(--text-secondary)' }}>
              AI is breaking the work down in a different way.
            </span>
          </span>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          opacity: job.status === 'decomposing' && job.tasks.length > 0 ? 0.4 : 1,
          transition: 'opacity 120ms ease-out',
        }}
      >
        {job.tasks.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {job.status === 'decomposing' ? 'AI is breaking down the task…' : '(no tasks)'}
          </div>
        )}
        {(() => {
          // Map task ID → user-visible 1-based index for friendly
          // dependsOn rendering. The decomposer emits ids like t1/t2,
          // but the user only sees the row's numeric leading indicator,
          // so "← t3,t5" is jargon. We translate to "after tasks 3, 5".
          const idToIndex = new Map<string, number>();
          job.tasks.forEach((t, i) => idToIndex.set(t.id, i + 1));
          return job.tasks.map((task, idx) => {
            const depIndices = task.dependsOn
              .map((id) => idToIndex.get(id))
              .filter((n): n is number => typeof n === 'number');
            const dependsOnLabel = depIndices.length
              ? `after task ${depIndices.join(', ')}`
              : undefined;
            return (
              <TaskRow
                key={task.id}
                task={task}
                index={idx + 1}
                dimmed={dimmedIds.has(task.id)}
                jobCancelled={job.status === 'cancelled'}
                disabled={acting}
                dependsOnLabel={dependsOnLabel}
                editable={job.status === 'planning'}
                onSaveEdit={(updatedTask) => {
                  const next = job.tasks.map((t) =>
                    t.id === updatedTask.id ? { ...t, ...updatedTask } : t,
                  );
                  return runAction(() => updateJobTasks(job.id, next));
                }}
                onRetry={(reason) => runAction(() => retryJobTask(job.id, task.id, reason ? { reason } : undefined))}
                onAccept={(reason) => runAction(() => acceptJobTask(job.id, task.id, reason ? { reason } : undefined))}
                onSkip={(reason) => runAction(() => skipJobTask(job.id, task.id, reason ? { reason } : undefined))}
                onUnblock={() => runAction(() => unblockJobTask(job.id, task.id))}
              />
            );
          });
        })()}
      </div>

      {canApprove && (job.risks ?? job.risksKo) && (job.risks ?? job.risksKo)!.length > 0 && (
        <PlanRisksBlock risks={(job.risks ?? job.risksKo)!} />
      )}

      {canApprove && (
        <PlanQaStrategyLine
          strategy={job.qaStrategy}
          rationale={job.qaRationale ?? job.qaRationaleKo}
        />
      )}

      {canApprove && (
        <PlanFeedbackInput
          disabled={acting}
          onSubmit={(feedback) =>
            runAction(() => redecomposeJob(job.id, feedback))
          }
        />
      )}

      <footer
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid var(--border-primary)',
          alignItems: 'center',
        }}
      >
        {/* LEFT: Inspect Console icon link (small, icon only) */}
        <a
          href={`http://127.0.0.1:4174/jobs/${encodeURIComponent(job.id)}`}
          target="_blank"
          rel="noreferrer"
          title={`Open detail page for job (${job.id}) in Inspect Console`}
          aria-label="Inspect Console"
          style={{
            ...secondaryBtn,
            padding: '4px 8px',
            fontSize: 14,
            lineHeight: 1,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            // marginRight:auto pushes all subsequent buttons to the right
            marginRight: 'auto',
          }}
        >
          📊
          <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.6 }}>↗</span>
        </a>

        {/* RIGHT group — action order: cancel → re-plan → approve and start (or equivalent primary).
            Conditionals like QA pass / promote / resume / open result page belong to the same group.
            DOM order matches visual order. flex wraps naturally on overflow. */}
        {canCancel && (
          <button
            disabled={acting}
            onClick={() => {
              const hasLanded = job.tasks.some((t) => !!t.commitSha);
              if (!hasLanded) {
                if (window.confirm('Cancel this job?')) {
                  void runAction(() => cancelJob(job.id));
                }
                return;
              }
              if (
                !window.confirm(
                  'Cancel this job?\n\nChanges made during execution will remain in the working view.',
                )
              ) {
                return;
              }
              const rewind = window.confirm(
                'Also revert the work output?\n\n[OK] Revert to the state before the job started (removes changes)\n[Cancel] Keep changes as-is',
              );
              void runAction(() => cancelJob(job.id, rewind));
            }}
            style={dangerBtn}
          >
            Cancel
          </button>
        )}
        {canRedecompose && (
          <button
            disabled={acting}
            onClick={() => runAction(() => redecomposeJob(job.id))}
            style={secondaryBtn}
            title="Re-request a different task breakdown when the current one isn't satisfactory"
          >
            Re-plan
          </button>
        )}
        {job.targetRoute &&
          (job.status === 'qa' || job.status === 'complete') && (
            <button
              disabled={acting}
              onClick={() => requestIframeNav(job.targetRoute!)}
              style={secondaryBtn}
              title={`Navigate the working tab to the ${job.targetRoute} page`}
            >
              Open result page ↗
            </button>
          )}
        {canResume && (
          <button
            disabled={acting}
            onClick={() => runAction(() => resumeJob(job.id))}
            style={primaryBtn}
          >
            Resume
          </button>
        )}
        {canQaPass && (
          <button
            disabled={acting}
            onClick={() => runAction(() => markQaPass(job.id))}
            style={primaryBtn}
            title="Press after verifying the behavior in the actual app"
          >
            QA pass ✓
          </button>
        )}
        {canPromote && (
          <button
            disabled={acting}
            onClick={() =>
              navigate(`/p/${encodeURIComponent(job.playgroundId)}`, {
                state: { openPromote: true },
              })
            }
            style={primaryBtn}
          >
            promote →
          </button>
        )}
        {canApprove && (
          <button
            disabled={acting}
            onClick={() => runAction(() => approveJobPlan(job.id))}
            style={primaryBtn}
          >
            Approve and start ▶
          </button>
        )}
      </footer>

      <FinalSummarySection job={job} />

      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-danger, #d33)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Plan v3 Phase 2 §4.2 — final summary card rendered when the job completes
 * or carries review warnings. Surfaces auto-progressed warnings, leaf-only
 * revert affordances (Phase 3 wires the actual revert call), and a follow-up
 * placeholder (Phase 3 wires the LLM suggestions).
 *
 * First-time inline notice (G1b) explains the auto-progress paradigm so users
 * who haven't seen it before don't assume a clean ✅ run means problem-free.
 */
function FinalSummarySection({ job }: { job: Job }) {
  const summary = job.summary;
  // Show when job is complete OR there's at least one warning to surface
  // mid-run. paused (build error) jobs with warnings also benefit.
  const visible =
    !!summary &&
    (job.status === 'complete' || (summary.warningCount ?? 0) > 0);
  // Local-storage based onboarding flag — Plan v3 G1b. localStorage is
  // sufficient for the 시범 단계 (1-2 users); future plan can swap for a
  // server-side per-user flag if multiple devices need to share state.
  const [noticeShown, setNoticeShown] = useState<boolean>(() => {
    try {
      return localStorage.getItem('omc.paradigmNoticeShown.v3') === '1';
    } catch {
      return true;
    }
  });
  const dismissNotice = useCallback(() => {
    try {
      localStorage.setItem('omc.paradigmNoticeShown.v3', '1');
    } catch {
      // ignore — quota or private-mode; the notice just shows again next time.
    }
    setNoticeShown(true);
  }, []);

  if (!visible || !summary) return null;

  return (
    <section
      style={{
        marginTop: 12,
        paddingTop: 10,
        borderTop: '1px solid var(--border-secondary)',
      }}
    >
      {!noticeShown && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 10px',
            background: 'var(--bg-info-subtle, rgba(20, 83, 182, 0.06))',
            border: '1px solid var(--border-info, rgba(20, 83, 182, 0.25))',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--text-primary)',
            lineHeight: 1.5,
          }}
        >
          <strong>새 동작</strong> — AI 가 task 진행 중 review 경고는 자동으로 넘어가도록 바뀌었어요.
          모든 결과는 아래에서 한눈에 확인하고, 위험한 변경은 여전히 멈춰서 알려드립니다.
          <button
            type="button"
            onClick={dismissNotice}
            style={{
              marginLeft: 8,
              padding: '2px 8px',
              fontSize: 11,
              border: '1px solid var(--border-primary)',
              borderRadius: 4,
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            알겠습니다
          </button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginBottom: 10,
        }}
      >
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>
            {summary.reviewed}/{summary.total}
          </strong>
          {' '}완료
        </span>
        {summary.skipped > 0 && <span>⊘ {summary.skipped} skipped</span>}
        {summary.blocked > 0 && <span>🚫 {summary.blocked} blocked</span>}
        {summary.failed > 0 && <span style={{ color: 'var(--error)' }}>❌ {summary.failed} failed</span>}
        {summary.warningCount > 0 && (
          <span style={{ color: 'var(--text-warn, #8a5a00)' }}>
            ⚠ {summary.warningCount} review {summary.warningCount === 1 ? 'warning' : 'warnings'}
          </span>
        )}
        {summary.changedFiles.length > 0 && (
          <span>📄 {summary.changedFiles.length} 파일 변경</span>
        )}
      </div>

      {summary.warningCount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {summary.warnings.map((w) => (
            <div
              key={w.taskId}
              style={{
                padding: '8px 10px',
                background: 'var(--bg-warn, #fff7e6)',
                border: '1px solid var(--border-warn, #f5c26b)',
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <strong style={{ color: 'var(--text-warn, #8a5a00)' }}>⚠ {w.title}</strong>
                {w.isNewBuild && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'var(--chip-bg, rgba(20, 83, 182, 0.12))',
                      color: 'var(--chip-text, #1453b6)',
                    }}
                  >
                    🛠 New build
                  </span>
                )}
                <span style={{ marginLeft: 'auto' }}>
                  <button
                    type="button"
                    disabled={!w.canRevert}
                    title={
                      w.canRevert
                        ? '이 task의 변경을 되돌립니다 (Phase 3에서 실제 동작 연결).'
                        : '후속 task가 같은 파일을 수정해 자동 revert 불가 — 새 PRD로 처리하세요.'
                    }
                    onClick={() => {
                      window.alert('Phase 3 에서 revert 동작이 연결됩니다.');
                    }}
                    style={{
                      padding: '3px 10px',
                      fontSize: 11,
                      border: `1px solid ${w.canRevert ? 'var(--border-primary)' : 'var(--border-secondary)'}`,
                      background: 'transparent',
                      borderRadius: 4,
                      cursor: w.canRevert ? 'pointer' : 'not-allowed',
                      color: w.canRevert
                        ? 'var(--text-primary)'
                        : 'var(--text-tertiary)',
                      opacity: w.canRevert ? 1 : 0.5,
                    }}
                  >
                    ↶ Revert
                  </button>
                </span>
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>{w.notes}</div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          padding: '8px 10px',
          fontSize: 11,
          color: 'var(--text-tertiary)',
          background: 'var(--bg-secondary)',
          border: '1px dashed var(--border-secondary)',
          borderRadius: 6,
        }}
      >
        💡 후속 작업 제안은 Phase 3 에서 추가됩니다.
      </div>
    </section>
  );
}

// ── Task row ─────────────────────────────────────────────────────────

function TaskRow({
  task,
  index,
  dimmed = false,
  jobCancelled = false,
  disabled,
  dependsOnLabel,
  editable = false,
  onSaveEdit,
  onRetry,
  onAccept,
  onSkip,
  onUnblock,
}: {
  task: JobTask;
  index: number;
  dimmed?: boolean;
  jobCancelled?: boolean;
  disabled: boolean;
  dependsOnLabel?: string;
  /** Allow inline ✎ editing of title / description. Wired by the
   * parent only while the job is in `planning` so we don't let users
   * mutate tasks that are already mid-flight or terminal. */
  editable?: boolean;
  onSaveEdit?: (
    updated: Pick<JobTask, 'id' | 'title' | 'description' | 'dependsOn'>,
  ) => void | Promise<unknown>;
  onRetry: (reason?: string) => void;
  onAccept: (reason?: string) => void;
  onSkip: (reason?: string) => void;
  onUnblock: () => void;
}) {
  const canRetry = task.status === 'failed';
  const canSkip =
    task.status === 'pending' ||
    task.status === 'failed' ||
    task.status === 'running' ||
    task.status === 'blocked';
  const canUnblock = task.status === 'blocked';

  // Keep individual task rows collapsed by default. The 1-line snippet
  // below the title is enough for users to decide whether to open the
  // full description. Keeping descriptions expanded by default produced
  // wall-of-text cards that were impossible to scan.
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description);
  const isEditable = editable && !!onSaveEdit && task.status === 'pending';
  const hasActions = canRetry || canUnblock || canSkip;

  const isLive =
    !jobCancelled && (task.status === 'running' || task.status === 'committed');
  // Subscribe to the agent's SSE stream while this task is live. The
  // hook handles teardown — we just consume the snapshot.
  const stream = useAgentStream(task.changeRequestId, isLive);
  return (
    <div
      style={{
        padding: '6px 8px',
        border: '1px solid var(--border-primary)',
        borderRadius: 6,
        background: 'var(--bg-surface, #ffffff)',
        opacity: dimmed ? 0.45 : 1,
        transition: 'opacity 120ms ease-out',
        ...(isLive && !dimmed
          ? {
              borderColor: 'var(--text-info, #1453b6)',
              animation: 'jobTaskPulse 1.6s ease-in-out infinite',
            }
          : null),
      }}
      title={dimmed ? 'Viewing a past point — commits after this task are not reflected in the current working tree.' : undefined}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minWidth: 0,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <TaskLeading task={task} index={index} jobCancelled={jobCancelled} />
        <span
          style={{
            fontWeight: 500,
            fontSize: 13,
            lineHeight: 1.4,
            color: 'var(--text-primary)',
            flex: 1,
            minWidth: 0,
            wordBreak: 'keep-all',
            overflowWrap: 'anywhere',
          }}
        >
          {task.title}
          {task.isNewBuild && (
            <span
              style={{
                marginLeft: 6,
                padding: '1px 6px',
                fontSize: 10,
                fontWeight: 500,
                borderRadius: 4,
                background: 'var(--chip-bg, rgba(20, 83, 182, 0.12))',
                color: 'var(--chip-text, #1453b6)',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle',
              }}
              title="This task introduces a new component without a DS equivalent — reviewer skips DS-equivalence check."
            >
              🛠 New build
            </span>
          )}
          {task.review?.verdict === 'fail' &&
            (task.review.severity ?? 'warning') === 'warning' && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  color: 'var(--text-warn, #8a5a00)',
                  verticalAlign: 'middle',
                }}
                title={`Review warning: ${task.review.notes}`}
              >
                ⚠
              </span>
            )}
        </span>
        {dependsOnLabel && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              whiteSpace: 'nowrap',
            }}
            title="This task cannot start until the numbered tasks above are complete."
          >
            ← {dependsOnLabel}
          </span>
        )}
        {isEditable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditTitle(task.title);
              setEditDescription(task.description);
              setEditing((v) => !v);
              if (!editing) setExpanded(true);
            }}
            title={editing ? 'Cancel editing' : 'Edit title/description'}
            style={{
              padding: '2px 6px',
              border: '1px solid var(--border-primary)',
              borderRadius: 4,
              background: editing ? 'var(--accent, #1453b6)' : 'transparent',
              color: editing ? '#fff' : 'var(--text-tertiary)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ✎
          </button>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {expanded ? '▾' : '›'}
        </span>
      </div>
      {isLive && (task.currentPhase || stream) && (
        <ActivityPanel
          phase={task.currentPhase ?? null}
          stream={stream}
        />
      )}
      {expanded && editing && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Title
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={disabled}
              style={{
                marginTop: 2,
                width: '100%',
                fontSize: 13,
                fontFamily: 'inherit',
                color: 'var(--text-primary)',
                background: 'var(--bg-surface, #fff)',
                border: '1px solid var(--border-primary)',
                borderRadius: 4,
                padding: '4px 6px',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Description
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              disabled={disabled}
              rows={4}
              style={{
                marginTop: 2,
                width: '100%',
                fontSize: 13,
                fontFamily: 'inherit',
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                background: 'var(--bg-surface, #fff)',
                border: '1px solid var(--border-primary)',
                borderRadius: 4,
                padding: 6,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setEditing(false);
                setEditTitle(task.title);
                setEditDescription(task.description);
              }}
              style={tinyBtn}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={
                disabled ||
                (!editTitle.trim() && !editDescription.trim()) ||
                (editTitle === task.title && editDescription === task.description)
              }
              onClick={() => {
                if (!onSaveEdit) return;
                const promise = onSaveEdit({
                  id: task.id,
                  title: editTitle.trim() || task.title,
                  description: editDescription.trim() || task.description,
                  dependsOn: task.dependsOn,
                });
                Promise.resolve(promise).then(() => setEditing(false));
              }}
              style={{
                ...tinyBtn,
                background: 'var(--accent, #1453b6)',
                color: '#fff',
                borderColor: 'var(--accent, #1453b6)',
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
      {expanded && !editing && (
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: 'var(--text-primary)',
            lineHeight: 1.7,
          }}
        >
          <FormattedDescription text={task.description} />
        </div>
      )}
      {task.review && (
        <div
          style={{
            marginTop: 6,
            padding: '6px 8px',
            borderRadius: 4,
            background:
              task.review.verdict === 'pass'
                ? 'rgba(27, 122, 67, 0.08)'
                : 'rgba(198, 40, 40, 0.08)',
            fontSize: 11,
            color:
              task.review.verdict === 'pass'
                ? 'var(--text-success, #1b7a43)'
                : 'var(--text-danger, #c62828)',
            lineHeight: 1.5,
          }}
        >
          <strong>review {task.review.verdict}:</strong> {task.review.notes}
          {task.review.verdict === 'fail' &&
            task.status === 'failed' &&
            !jobCancelled && (
              <ReviewFailActions
                disabled={disabled}
                onRetry={onRetry}
                onAccept={onAccept}
                onSkip={onSkip}
              />
            )}
          {task.review.acceptedByUser && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 10,
                color: 'var(--text-tertiary)',
              }}
            >
              · accepted by user
            </span>
          )}
        </div>
      )}
      {expanded && hasActions && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {canRetry && (
            <button disabled={disabled} onClick={() => onRetry()} style={tinyBtn}>
              retry
            </button>
          )}
          {canUnblock && (
            <button disabled={disabled} onClick={onUnblock} style={tinyBtn}>
              unblock
            </button>
          )}
          {canSkip && (
            <button disabled={disabled} onClick={() => onSkip()} style={tinyBtn}>
              skip
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Time-travel dimming ──────────────────────────────────────────────
//
// When the playground is checked out at an older sha (user clicked a
// checkpoint via \"view\"), every task whose commit came *after* that
// sha is no longer reflected in the working tree. We can't run a full
// git-ancestry check from the browser, but we have a better signal
// for free: the runner executes tasks serially, so \`job.tasks\` is
// already in commit order. Find the index of the task whose commitSha
// matches the checkedOutSha and dim everything after.
//
// Restore-to-sha (which creates revert commits and advances HEAD) is
// not quite the same shape — no task's commitSha matches the resulting
// HEAD — so we skip the dim for that case. Good enough for v0.

function computeDimmedTaskIds(
  tasks: JobTask[],
  checkedOutSha: string | null,
  headSha: string | null,
): Set<string> {
  const anchor = checkedOutSha ?? null;
  if (!anchor) return new Set();
  // We're in time-travel only if the anchor differs from the real head
  // (otherwise \"checkout\" is a no-op and nothing is superseded).
  if (headSha && anchor === headSha) return new Set();

  const anchorIdx = tasks.findIndex(
    (t) => !!t.commitSha && (t.commitSha === anchor || t.commitSha.startsWith(anchor)),
  );
  if (anchorIdx === -1) return new Set();
  const dimmed = new Set<string>();
  for (let i = anchorIdx + 1; i < tasks.length; i += 1) {
    if (tasks[i].commitSha) dimmed.add(tasks[i].id);
  }
  return dimmed;
}

// ── Description formatter ────────────────────────────────────────────
//
// Task descriptions come back from the LLM as dense single-paragraph
// runs. Three patterns we can autodetect and reformat into something
// scannable:
//
//   - `(1) ... (2) ... (3) ...` enumerations → ordered list.
//   - Lines starting with `- ` or `* ` → unordered list.
//   - `\n\n` paragraph breaks → paragraphs.
//
// Nothing detected → render as a single paragraph with preserved
// whitespace, but with real typography spacing. The point is to never
// stare at a 6-line wall of dense 11px text again.

function FormattedDescription({ text }: { text: string }) {
  const trimmed = text.trim();

  // (1) (2) (3) ... enumerations — match the opening "(1)" and split on
  // each subsequent "(N)" boundary. Preserves the prefix before "(1)".
  const enumMatch = trimmed.match(/\(1\)/);
  if (enumMatch) {
    const intro = trimmed.slice(0, enumMatch.index).trim();
    const rest = trimmed.slice(enumMatch.index);
    const parts = rest.split(/\s*\((\d+)\)\s+/).filter((s) => s.length > 0);
    // After split: [number, text, number, text, ...]
    /** @type {Array<{ n: string, body: string }>} */
    const items: Array<{ n: string; body: string }> = [];
    for (let i = 0; i < parts.length; i += 2) {
      if (parts[i + 1] == null) continue;
      items.push({ n: parts[i], body: parts[i + 1].trim() });
    }
    if (items.length >= 2) {
      return (
        <>
          {intro && <p style={paragraphStyle}>{intro}</p>}
          <ol style={listStyle}>
            {items.map((it, idx) => (
              <li key={idx} style={listItemStyle}>
                {it.body}
              </li>
            ))}
          </ol>
        </>
      );
    }
  }

  // Lines starting with "- " / "* " → unordered list.
  const lines = trimmed.split(/\n+/);
  const allBulleted = lines.length > 1 && lines.every((l) => /^[-*]\s+/.test(l.trim()));
  if (allBulleted) {
    return (
      <ul style={listStyle}>
        {lines.map((l, idx) => (
          <li key={idx} style={listItemStyle}>
            {l.trim().replace(/^[-*]\s+/, '')}
          </li>
        ))}
      </ul>
    );
  }

  // Otherwise render each \n\n-delimited chunk as its own paragraph.
  // Single-paragraph case just renders one <p> with the whole text.
  const paragraphs = trimmed.split(/\n\s*\n/);
  return (
    <>
      {paragraphs.map((p, idx) => (
        <p key={idx} style={paragraphStyle}>
          {p}
        </p>
      ))}
    </>
  );
}

const paragraphStyle: React.CSSProperties = {
  margin: '0 0 8px',
};

const listStyle: React.CSSProperties = {
  margin: '4px 0 8px',
  paddingLeft: 20,
};

const listItemStyle: React.CSSProperties = {
  marginBottom: 4,
};

// ── Task leading indicator ───────────────────────────────────────────
//
// Pending tasks are the scan-over bulk; showing a PENDING pill for
// every one of four tasks was pure noise. For those we render the
// task index in a subtle circle. Non-pending statuses get an icon
// + short label so the scan-eye finds the interesting rows first.

function TaskLeading({
  task,
  index,
  jobCancelled = false,
}: {
  task: JobTask;
  index: number;
  jobCancelled?: boolean;
}) {
  // Cancelled job + a task still mid-flight: the pipeline keeps
  // running in the background (no docker abort) but the user has
  // already given up on this run. Replace the WORKING pixel-agent
  // with a clear "cancelled" pill so the row stops feeling active.
  if (jobCancelled && (task.status === 'running' || task.status === 'committed')) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          padding: '2px 8px',
          borderRadius: 10,
          background: 'var(--bg-elevated, #eef0f3)',
          color: 'var(--text-tertiary)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        Cancelled
      </span>
    );
  }
  if (task.status === 'running' || task.status === 'committed') {
    // Pixel agent walking — makes in-flight tasks feel alive instead of
    // a dead "RUNNING" pill. Sprite is char_0 from pablodelucca/pixel-
    // agents (MIT, bundled in public/pixel-agents/).
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <PixelAgentSprite />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
            color: 'var(--text-info, #1453b6)',
            textTransform: 'uppercase',
          }}
        >
          {task.status === 'committed' ? 'reviewing' : 'working'}
        </span>
      </span>
    );
  }
  if (task.status === 'pending') {
    return (
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'var(--bg-elevated, #eef0f3)',
          color: 'var(--text-tertiary)',
          fontSize: 10,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {index}
      </span>
    );
  }
  const { icon, bg, fg, label } = leadingFor(task.status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        background: bg,
        color: fg,
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

/**
 * 16×24 sprite-sheet window from char_0.png, scaled 2x (→ 32×48) and
 * animated through the first row (4 walk frames, 150ms each). Pixel-
 * perfect rendering via `image-rendering: pixelated` keeps the retro
 * feel. Credit: pablodelucca/pixel-agents (MIT) → JIK-A-4 / Metro City
 * free top-down character pack.
 */
function PixelAgentSprite() {
  return (
    <span
      aria-label="Agent working"
      role="img"
      style={{
        display: 'inline-block',
        width: 24,
        height: 36,
        backgroundImage: "url('/pixel-agents/char_0.png')",
        backgroundRepeat: 'no-repeat',
        backgroundSize: '168px 144px', // 1.5× the original 112×96 sheet
        imageRendering: 'pixelated',
        animation: 'pixelAgentWalk 0.6s steps(4) infinite',
      }}
    />
  );
}

// Inline action group rendered inside the review-fail box. Surfaces
// the three escape paths a user has when an LLM review fails so they
// don't have to expand the row to find buttons. Order is intentional:
// retry first (most common, cheapest), accept-anyway second (escape
// hatch for the "agent overshot scope but result is still useful"
// case), skip last (most destructive — also blocks downstream tasks).
const ACTION_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '— Select reason (optional) —' },
  { value: 'syntax_error', label: 'Syntax / type error' },
  { value: 'logic_error', label: 'Logic / implementation error' },
  { value: 'scope_creep', label: 'Out of scope (changes beyond PRD)' },
  { value: 'partial', label: 'Partial implementation (only some requirements)' },
  { value: 'wrong_target', label: 'Wrong file / component' },
  { value: 'over_delivered', label: 'Over-delivered (too many changes)' },
  { value: 'other', label: 'Other' },
];

function ReviewFailActions({
  disabled,
  onRetry,
  onAccept,
  onSkip,
}: {
  disabled: boolean;
  onRetry: (reason?: string) => void;
  onAccept: (reason?: string) => void;
  onSkip: (reason?: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid rgba(198, 40, 40, 0.18)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          fontStyle: 'italic',
        }}
      >
        Next steps
      </span>
      <select
        value={reason}
        disabled={disabled}
        onChange={(e) => setReason(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        style={{
          fontSize: 11,
          padding: '3px 6px',
          borderRadius: 4,
          border: '1px solid var(--border-primary)',
          background: 'var(--surface-secondary, #f5f5f5)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        {ACTION_REASON_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onRetry(reason || undefined);
          }}
          style={primaryActionBtn}
          title="Retry with the feedback above applied"
        >
          🔁 Retry
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onAccept(reason || undefined);
          }}
          style={secondaryActionBtn}
          title="Accept the result and continue with subsequent tasks (e.g. over-delivered cases)"
        >
          ✓ Accept as-is
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onSkip(reason || undefined);
          }}
          style={dangerActionBtn}
          title="Skip this task and continue (downstream dependent tasks will also be blocked)"
        >
          ✗ Skip
        </button>
      </div>
    </div>
  );
}

const primaryActionBtn: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid var(--accent, #1453b6)',
  background: 'var(--accent, #1453b6)',
  color: '#fff',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryActionBtn: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-surface, #ffffff)',
  color: 'var(--text-primary)',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
};

const dangerActionBtn: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid rgba(198, 40, 40, 0.3)',
  background: 'transparent',
  color: 'var(--text-danger, #c62828)',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
};

// Single grouped panel showing everything the user wants to know
// while a task is live: which pipeline phase the change-request is
// in, which tools the agent has invoked so far, and the latest
// thought it emitted. Lives inside the task row so the visual
// proximity to the title keeps the "this row is the one running"
// signal strong, but its own border/background separates it from
// the row chrome so the eye doesn't have to parse three free-floating
// stripes of italic text.
function ActivityPanel({
  phase,
  stream,
}: {
  phase: string | null;
  stream: AgentStreamSnapshot | null;
}) {
  const toolEntries = stream
    ? Object.entries(stream.toolCounts).sort((a, b) => b[1] - a[1])
    : [];
  const hasTools = toolEntries.length > 0;
  const thought = stream?.latestThought
    ? stream.latestThought.length > 110
      ? `${stream.latestThought.slice(0, 110)}…`
      : stream.latestThought
    : null;
  return (
    <div
      style={{
        marginTop: 8,
        marginLeft: 44, // align with the title column, past the leading icon
        padding: '8px 10px',
        borderRadius: 6,
        background: 'rgba(20, 83, 182, 0.05)',
        border: '1px solid rgba(20, 83, 182, 0.18)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {phase && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-info, #1453b6)',
          }}
        >
          <LivePhaseDot />
          <span>{phaseLabel(phase)}</span>
        </div>
      )}
      {hasTools && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {toolEntries.map(([tool, count]) => (
            <span
              key={tool}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 6px',
                borderRadius: 10,
                background: 'rgba(20, 83, 182, 0.1)',
                color: 'var(--text-info, #1453b6)',
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", monospace',
                fontSize: 10,
                fontWeight: 500,
              }}
            >
              <span aria-hidden>🛠️</span>
              <span>{tool}</span>
              {count > 1 && (
                <span style={{ opacity: 0.65 }}>×{count}</span>
              )}
            </span>
          ))}
        </div>
      )}
      {thought && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            paddingTop: 4,
            borderTop: '1px dashed rgba(20, 83, 182, 0.15)',
            fontSize: 11,
            color: 'var(--text-secondary, #4a5260)',
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}
        >
          <span aria-hidden style={{ flexShrink: 0 }}>💬</span>
          <span style={{ flex: 1, minWidth: 0 }}>{thought}</span>
        </div>
      )}
    </div>
  );
}

function LivePhaseDot() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--text-info, #1453b6)',
        animation: 'livePhaseBlink 1s ease-in-out infinite',
        flexShrink: 0,
      }}
    />
  );
}

// Map the change-request pipeline's `phase` strings to user-facing
// English labels. Unknown phases pass through verbatim — better to
// surface a raw token than swallow a new pipeline state silently.
function phaseLabel(phase: string): string {
  switch (phase) {
    case 'queued': return 'Queued';
    case 'creating_sandbox': return 'Preparing sandbox';
    case 'syncing_source': return 'Syncing source';
    case 'starting_agent': return 'Starting agent';
    case 'running_agent': return 'Writing code';
    case 'collecting_diff': return 'Collecting changes';
    case 'preview_ready': return 'Preview ready';
    case 'validating': return 'Validating types';
    case 'verifying': return 'Verifying types';
    case 'verification_retry': return 'Retrying (verification failed)';
    case 'verification_failed': return 'Verification failed';
    case 'capturing_screenshot': return 'Capturing screenshot';
    case 'creating_pr': return 'Creating PR';
    case 'queued_for_retry': return 'Queued for retry';
    case 'pipeline_error': return 'Pipeline error';
    case 'no_change_needed': return 'No change needed';
    default: return phase;
  }
}

function leadingFor(status: string) {
  switch (status) {
    case 'running':
      return { icon: '●', bg: 'rgba(20, 83, 182, 0.12)', fg: 'var(--text-info, #1453b6)', label: 'running' };
    case 'committed':
      return { icon: '●', bg: 'rgba(20, 83, 182, 0.12)', fg: 'var(--text-info, #1453b6)', label: 'reviewing' };
    case 'reviewed':
      return { icon: '✓', bg: 'rgba(27, 122, 67, 0.12)', fg: 'var(--text-success, #1b7a43)', label: 'done' };
    case 'failed':
      return { icon: '×', bg: 'rgba(198, 40, 40, 0.1)', fg: 'var(--text-danger, #c62828)', label: 'failed' };
    case 'skipped':
      return { icon: '–', bg: 'var(--bg-elevated)', fg: 'var(--text-tertiary)', label: 'skipped' };
    case 'blocked':
      return { icon: '⏸', bg: 'rgba(245, 194, 107, 0.2)', fg: 'var(--text-warn, #8a5a00)', label: 'blocked' };
    default:
      return { icon: '·', bg: 'var(--bg-elevated)', fg: 'var(--text-secondary)', label: status };
  }
}

// ── Plan feedback input ──────────────────────────────────────────────
//
// Free-form natural-language editor that re-runs the decomposer with
// the user's note appended (server: `userFeedback` ctx). Companion to
// the per-task ✎ button — that one is for surgical edits, this one
// is for structural changes the LLM should reorganize ("split step 3 in two
// and remove the auth-guard task").

function PlanFeedbackInput({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (feedback: string) => void;
}) {
  const [text, setText] = useState('');
  const send = () => {
    const v = text.trim();
    if (!v) return;
    onSubmit(v);
    setText('');
  };
  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 6,
        background: 'var(--bg-elevated, #f6f7f9)',
        border: '1px solid var(--border-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-tertiary)',
          fontWeight: 500,
        }}
      >
        Request changes to this plan
      </span>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          const isMod = e.metaKey || e.ctrlKey;
          if (isMod && e.key === 'Enter') {
            e.preventDefault();
            send();
          }
        }}
        placeholder="e.g. Split task 3 into search and filter. Remove the permission guard task. (⌘/Ctrl + Enter to send)"
        disabled={disabled}
        rows={2}
        style={{
          width: '100%',
          fontSize: 12,
          fontFamily: 'inherit',
          color: 'var(--text-primary)',
          background: 'var(--bg-surface, #fff)',
          border: '1px solid var(--border-primary)',
          borderRadius: 4,
          padding: 6,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          disabled={disabled || !text.trim()}
          onClick={send}
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid var(--accent, #1453b6)',
            background: text.trim() ? 'var(--accent, #1453b6)' : 'var(--bg-elevated)',
            color: text.trim() ? '#fff' : 'var(--text-tertiary)',
            fontSize: 11,
            fontWeight: 600,
            cursor: text.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          Re-plan with feedback
        </button>
      </div>
    </div>
  );
}

// ── QA strategy chip ─────────────────────────────────────────────────
//
// Mirrors the catalog in `orchestrator/lib/job-qa-strategist.js`. We
// keep label + short blurb here so the UI can render them without a
// roundtrip; the rationale (LLM-written one-liner) goes in the title
// tooltip so users can see *why* this strategy was picked without
// crowding the header.

const QA_STRATEGY_LABELS: Record<
  QaStrategyId,
  { label: string; short: string }
> = {
  agent_review: { label: 'Agent comprehensive review', short: '🧪 Full' },
  inline_per_task: { label: 'Verify after each task', short: '🧪 Step' },
  final_route_smoke: { label: 'Route smoke only', short: '🧪 Smoke' },
  visual_diff: { label: 'Visual regression comparison', short: '🧪 Visual' },
  lint_only: { label: 'Type / lint only', short: '🧪 Lint' },
  human_only: { label: 'Manual human check', short: '🧪 Manual' },
};

/**
 * Surfaces the auto-QA runner's verdict for a job.
 *
 * Renders nothing unless the job has reached `qa`/`complete`. Three
 * states:
 *   1. status === 'qa' but no `qaAutoResult` yet → running banner.
 *   2. qaAutoResult.passed === true  → passed banner (green).
 *   3. qaAutoResult.passed === false → failed banner (red) + re-run btn.
 *
 * The manual "QA passed ✓" button stays — this banner is informational
 * only; it does not gate completion. The "re-run" button calls the
 * orchestrator's `rerun-qa` action which re-fires the same picked
 * strategy adapter from scratch (useful when the run hit a transient
 * playground restart, etc).
 */
function QaAutoResultBanner({
  job,
  acting,
  onRerun,
}: {
  job: Job;
  acting: boolean;
  onRerun: () => void;
}) {
  const inQaPhase = job.status === 'qa' || job.status === 'complete';
  if (!inQaPhase) return null;

  // No strategy decided yet → nothing to surface (the strategist
  // decision races the runner; if it never arrives we fall back to
  // human_only and the runner stamps an immediate pass which lands here).
  if (!job.qaStrategy) return null;

  const result = job.qaAutoResult;

  // In-flight: status hit `qa` but the runner hasn't stamped yet.
  if (!result) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          marginBottom: 8,
          background: 'rgba(20, 83, 182, 0.06)',
          border: '1px solid var(--text-info, #1453b6)',
          borderRadius: 4,
          fontSize: 12,
          color: 'var(--text-info, #1453b6)',
          animation: 'jobTaskPulse 1.6s ease-in-out infinite',
        }}
      >
        <PixelAgentSprite />
        <span>
          <strong>Auto QA running…</strong>
          <span
            style={{
              display: 'block',
              marginTop: 2,
              fontSize: 11,
              color: 'var(--text-secondary)',
            }}
          >
            Checking that the result page loads correctly.
          </span>
        </span>
      </div>
    );
  }

  // Re-running placeholder ("Re-running…") looks like an in-flight failure
  // — surface it as the running state instead.
  if (result.notes === 'Re-running…') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          marginBottom: 8,
          background: 'rgba(20, 83, 182, 0.06)',
          border: '1px solid var(--text-info, #1453b6)',
          borderRadius: 4,
          fontSize: 12,
          color: 'var(--text-info, #1453b6)',
          animation: 'jobTaskPulse 1.6s ease-in-out infinite',
        }}
      >
        <PixelAgentSprite />
        <span>
          <strong>Auto QA re-running…</strong>
        </span>
      </div>
    );
  }

  if (result.passed) {
    return (
      <div
        style={{
          padding: '6px 10px',
          marginBottom: 8,
          background: 'rgba(27, 122, 67, 0.08)',
          border: '1px solid var(--text-success, #1b7a43)',
          borderRadius: 4,
          fontSize: 12,
          color: 'var(--text-success, #1b7a43)',
        }}
      >
        🧪 Auto QA passed — {result.notes}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '8px 10px',
        marginBottom: 8,
        background: 'rgba(198, 40, 40, 0.06)',
        border: '1px solid var(--text-danger, #c62828)',
        borderRadius: 4,
        fontSize: 12,
        color: 'var(--text-danger, #c62828)',
      }}
    >
      <span style={{ flex: 1 }}>
        <strong>🧪 Auto QA failed</strong>
        <span
          style={{
            display: 'block',
            marginTop: 2,
            fontSize: 11,
            fontWeight: 400,
          }}
        >
          {result.notes}
        </span>
      </span>
      <button
        type="button"
        disabled={acting}
        onClick={onRerun}
        style={{
          padding: '3px 8px',
          fontSize: 11,
          background: 'var(--bg-elevated)',
          color: 'var(--text-danger, #c62828)',
          border: '1px solid var(--text-danger, #c62828)',
          borderRadius: 3,
          cursor: acting ? 'wait' : 'pointer',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
        title="Re-run auto QA (keeps the work as-is, retries verification only)"
      >
        🔁 Re-run
      </button>
    </div>
  );
}

/**
 * Plan-time risks block — surfaces the decomposer's PRD-specific
 * risk lines so the user reviews them alongside the task list before
 * approving. Hidden when the array is empty (decomposer prompt
 * explicitly suppresses generic / always-true risks, so a non-empty
 * array means something concrete is worth calling out).
 */
function PlanRisksBlock({ risks }: { risks: string[] }) {
  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        fontSize: 12,
        background: 'rgba(245, 194, 107, 0.10)',
        border: '1px solid rgba(245, 194, 107, 0.45)',
        borderRadius: 4,
        color: 'var(--text-warn, #8a5a00)',
      }}
    >
      <strong>⚠️ Cautions</strong>
      <ol
        style={{
          margin: '4px 0 0',
          paddingLeft: 20,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        {risks.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Plan-time QA banner — surfaces the chosen verification approach as
 * part of the plan the user is about to approve. The chip in the
 * header shows it too, but a chip is easy to miss; this line sits
 * directly above the approve button so the user signs off on
 * "this work + this verification" together.
 *
 * Renders nothing if no strategy is on the job yet (decomposer just
 * landed, strategist still picking) — the next 2s poll fills it in.
 */
function PlanQaStrategyLine({
  strategy,
  rationale,
}: {
  strategy?: QaStrategyId;
  rationale?: string;
}) {
  if (!strategy) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: '6px 10px',
          fontSize: 12,
          background: 'var(--bg-elevated)',
          border: '1px dashed var(--border-primary)',
          borderRadius: 4,
          color: 'var(--text-secondary)',
        }}
      >
        🧪 Auto-selecting verification strategy…
      </div>
    );
  }
  const meta = QA_STRATEGY_LABELS[strategy] ?? {
    label: strategy,
    short: '🧪 ' + strategy,
  };
  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        fontSize: 12,
        background: 'rgba(20, 83, 182, 0.04)',
        border: '1px solid rgba(20, 83, 182, 0.18)',
        borderRadius: 4,
        color: 'var(--text-info, #1453b6)',
      }}
    >
      <strong>🧪 Verification:</strong> {meta.label}
      {rationale && (
        <span
          style={{
            display: 'block',
            marginTop: 2,
            fontSize: 11,
            fontWeight: 400,
            color: 'var(--text-secondary)',
          }}
        >
          {rationale}
        </span>
      )}
    </div>
  );
}

function QaStrategyChip({
  strategy,
  rationale,
}: {
  strategy: QaStrategyId;
  rationale?: string;
}) {
  const meta = QA_STRATEGY_LABELS[strategy] ?? {
    label: strategy,
    short: '🧪 ' + strategy,
  };
  const tip = rationale
    ? `${meta.label} — ${rationale}`
    : meta.label;
  return (
    <span
      title={tip}
      style={{
        fontSize: 10,
        padding: '1px 7px',
        borderRadius: 999,
        background: 'rgba(20, 83, 182, 0.08)',
        color: 'var(--text-info, #1453b6)',
        border: '1px solid rgba(20, 83, 182, 0.18)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        cursor: 'help',
      }}
    >
      {meta.short}
    </span>
  );
}

// ── Status pill ──────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const color = pillColor(status);
  return (
    <span
      style={{
        fontSize: 9,
        padding: '1px 7px',
        borderRadius: 999,
        background: color.bg,
        color: color.fg,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        whiteSpace: 'nowrap',
      }}
    >
      {status}
    </span>
  );
}

function pillColor(status: string) {
  switch (status) {
    case 'complete':
    case 'reviewed':
    case 'committed':
      return { bg: 'rgba(27, 122, 67, 0.12)', fg: 'var(--text-success, #1b7a43)' };
    case 'failed':
    case 'cancelled':
      return { bg: 'rgba(198, 40, 40, 0.1)', fg: 'var(--text-danger, #c62828)' };
    case 'paused':
    case 'blocked':
      return { bg: 'rgba(245, 194, 107, 0.2)', fg: 'var(--text-warn, #8a5a00)' };
    case 'running':
    case 'delegating':
    case 'reviewing':
      return { bg: 'rgba(20, 83, 182, 0.12)', fg: 'var(--text-info, #1453b6)' };
    default:
      return { bg: 'var(--bg-elevated)', fg: 'var(--text-secondary)' };
  }
}

// ── Styles ───────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  padding: 10,
  border: '1px solid var(--border-primary)',
  borderRadius: 8,
  background: 'var(--bg-elevated, #f7f7f9)',
  fontSize: 12,
};

const primaryBtn: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-inverse, #fff)',
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  color: 'var(--text-primary)',
  background: 'var(--bg-surface, #ffffff)',
  border: '1px solid var(--border-primary)',
};

const dangerBtn: React.CSSProperties = {
  ...secondaryBtn,
  color: 'var(--text-danger, #c62828)',
};

const tinyBtn: React.CSSProperties = {
  padding: '2px 8px',
  fontSize: 10,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  background: 'var(--bg-surface, #ffffff)',
  border: '1px solid var(--border-primary)',
  borderRadius: 3,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

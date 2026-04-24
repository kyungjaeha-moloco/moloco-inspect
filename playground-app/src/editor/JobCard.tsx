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
import type { Job, JobTask } from '../services/orchestrator-client';
import {
  getJob,
  approveJobPlan,
  retryJobTask,
  skipJobTask,
  unblockJobTask,
  cancelJob,
  resumeJob,
  redecomposeJob,
  markQaPass,
} from '../services/orchestrator-client';

const POLL_INTERVAL_MS = 2000;

export function JobCard({ jobId }: { jobId: string }) {
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

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
  const canRedecompose =
    job.status === 'decomposing' || job.status === 'paused';

  const reviewedCount = job.tasks.filter((t) => t.status === 'reviewed').length;
  const skippedCount = job.tasks.filter((t) => t.status === 'skipped').length;

  return (
    <div style={containerStyle}>
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
        </div>
      </header>

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {job.tasks.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {job.status === 'decomposing' ? 'AI 가 작업을 쪼개는 중…' : '(태스크 없음)'}
          </div>
        )}
        {job.tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            disabled={acting}
            onRetry={() => runAction(() => retryJobTask(job.id, task.id))}
            onSkip={() => runAction(() => skipJobTask(job.id, task.id))}
            onUnblock={() => runAction(() => unblockJobTask(job.id, task.id))}
          />
        ))}
      </div>

      <footer
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid var(--border-primary)',
        }}
      >
        {canApprove && (
          <button
            disabled={acting}
            onClick={() => runAction(() => approveJobPlan(job.id))}
            style={primaryBtn}
          >
            승인하고 시작 ▶
          </button>
        )}
        {canResume && (
          <button
            disabled={acting}
            onClick={() => runAction(() => resumeJob(job.id))}
            style={primaryBtn}
          >
            재개
          </button>
        )}
        {canQaPass && (
          <button
            disabled={acting}
            onClick={() => runAction(() => markQaPass(job.id))}
            style={primaryBtn}
            title="실제 앱에서 동작 확인 후 눌러주세요"
          >
            QA 통과 ✓
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
        {canRedecompose && (
          <button
            disabled={acting}
            onClick={() => runAction(() => redecomposeJob(job.id))}
            style={secondaryBtn}
          >
            재분해
          </button>
        )}
        {canCancel && (
          <button
            disabled={acting}
            onClick={() => {
              if (window.confirm('이 job 을 취소할까요? 이미 landed 된 커밋은 남습니다.')) {
                void runAction(() => cancelJob(job.id));
              }
            }}
            style={dangerBtn}
          >
            취소
          </button>
        )}
      </footer>

      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-danger, #d33)' }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Task row ─────────────────────────────────────────────────────────

function TaskRow({
  task,
  disabled,
  onRetry,
  onSkip,
  onUnblock,
}: {
  task: JobTask;
  disabled: boolean;
  onRetry: () => void;
  onSkip: () => void;
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
  const hasActions = canRetry || canUnblock || canSkip;

  return (
    <div
      style={{
        padding: '6px 8px',
        border: '1px solid var(--border-primary)',
        borderRadius: 6,
        background: 'var(--bg-surface, #ffffff)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <StatusPill status={task.status} />
        <span
          style={{
            fontWeight: 500,
            fontSize: 12,
            color: 'var(--text-primary)',
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={task.title}
        >
          {task.title}
        </span>
        {task.dependsOn.length > 0 && (
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            ← {task.dependsOn.join(',')}
          </span>
        )}
        <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
          {expanded ? '▾' : '▸'}
        </span>
      </div>
      {!expanded && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingLeft: 58, // align under title (past pill width)
            marginTop: 2,
          }}
          title={task.description}
        >
          {task.description}
        </div>
      )}
      {expanded && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.5,
          }}
        >
          {task.description}
        </div>
      )}
      {task.review && (
        <div
          style={{
            marginTop: 6,
            padding: '3px 6px',
            borderRadius: 4,
            background:
              task.review.verdict === 'pass'
                ? 'rgba(27, 122, 67, 0.08)'
                : 'rgba(198, 40, 40, 0.08)',
            fontSize: 10,
            color:
              task.review.verdict === 'pass'
                ? 'var(--text-success, #1b7a43)'
                : 'var(--text-danger, #c62828)',
            lineHeight: 1.4,
          }}
        >
          <strong>review {task.review.verdict}:</strong> {task.review.notes}
        </div>
      )}
      {expanded && hasActions && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          {canRetry && (
            <button disabled={disabled} onClick={onRetry} style={tinyBtn}>
              retry
            </button>
          )}
          {canUnblock && (
            <button disabled={disabled} onClick={onUnblock} style={tinyBtn}>
              unblock
            </button>
          )}
          {canSkip && (
            <button disabled={disabled} onClick={onSkip} style={tinyBtn}>
              skip
            </button>
          )}
        </div>
      )}
    </div>
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

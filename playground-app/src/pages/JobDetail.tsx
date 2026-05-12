/**
 * JobDetail — PRD → delivery pipeline, read + control view (J5a + minimal J5b).
 *
 * Plan: docs/superpowers/plans/2026-04-24-prd-to-delivery-thin-slice-v2.md §4 J5
 *
 * Polls GET /api/job/:id every 2s (no SSE in v0). Shows PRD, task list
 * with status + review notes, pause reason, and the minimum set of
 * controls to unblock the pipeline: approve-plan, retry, skip, unblock,
 * resume, cancel. Promote button lights up when status === 'complete'
 * and routes to the existing playground promote flow.
 *
 * Not a polished design — style tokens + functional layout. We'll
 * iterate after J6 tells us which affordances are actually used.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
} from '../services/orchestrator-client';

const POLL_INTERVAL_MS = 2000;

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    try {
      const next = await getJob(jobId);
      setJob(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [jobId]);

  // Initial load + poll.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const runAction = useCallback(
    async (fn: () => Promise<Job>) => {
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
    },
    [],
  );

  if (!jobId) return null;
  if (!job && !error) {
    return <div style={pageStyle}>loading job…</div>;
  }
  if (!job) {
    return (
      <div style={pageStyle}>
        <p style={{ color: 'var(--text-danger, #d33)' }}>{error}</p>
        <Link to="/">← list</Link>
      </div>
    );
  }

  const canApprove = job.status === 'planning' && job.tasks.length > 0;
  const canResume = job.status === 'paused';
  const canPromote = job.status === 'complete';
  const canCancel =
    job.status !== 'complete' &&
    job.status !== 'cancelled';
  const canRedecompose =
    job.status === 'decomposing' || job.status === 'paused';

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 16 }}>
        <Link
          to={`/p/${encodeURIComponent(job.playgroundId)}`}
          style={{ fontSize: 12, color: 'var(--text-tertiary)' }}
        >
          ← playground
        </Link>
        <h1 style={{ margin: '4px 0 2px', fontSize: 18 }}>Job {job.id}</h1>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          status: <StatusPill kind="job" status={job.status} /> ·{' '}
          {job.tasks.length} task{job.tasks.length === 1 ? '' : 's'}
        </div>
        {job.pausedReason && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              background: 'var(--bg-warn, #fff7e6)',
              border: '1px solid var(--border-warn, #f5c26b)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--text-warn, #8a5a00)',
            }}
          >
            ⏸ {job.pausedReason}
          </div>
        )}
      </header>

      <section style={sectionStyle}>
        <h2 style={h2Style}>PRD</h2>
        <pre
          style={{
            background: 'var(--bg-elevated)',
            padding: 12,
            borderRadius: 6,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 180,
            overflow: 'auto',
            margin: 0,
            fontFamily: 'inherit',
          }}
        >
          {job.prdText}
        </pre>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>Tasks</h2>
        {job.tasks.length === 0 && (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
            {job.status === 'decomposing' ? 'LLM is breaking down the task…' : 'None yet.'}
          </p>
        )}
        {job.tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            disabled={acting}
            onRetry={() => runAction(() => retryJobTask(job.id, t.id))}
            onSkip={() => runAction(() => skipJobTask(job.id, t.id))}
            onUnblock={() => runAction(() => unblockJobTask(job.id, t.id))}
          />
        ))}
      </section>

      <section style={{ ...sectionStyle, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canApprove && (
          <button
            disabled={acting}
            onClick={() => runAction(() => approveJobPlan(job.id))}
            style={primaryBtn}
          >
            Approve and start ▶
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
        {canRedecompose && (
          <button
            disabled={acting}
            onClick={() => runAction(() => redecomposeJob(job.id))}
            style={secondaryBtn}
          >
            Re-decompose
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
        {canCancel && (
          <button
            disabled={acting}
            onClick={() => {
              if (window.confirm('Cancel this job?')) {
                void runAction(() => cancelJob(job.id));
              }
            }}
            style={dangerBtn}
          >
            Cancel
          </button>
        )}
      </section>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--text-danger, #d33)', marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────

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

  return (
    <div
      style={{
        padding: 10,
        border: '1px solid var(--border-primary)',
        borderRadius: 6,
        marginBottom: 8,
        background: 'var(--bg-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <StatusPill kind="task" status={task.status} />
          <span style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {task.title}
          </span>
          {task.dependsOn.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
              after: {task.dependsOn.join(', ')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
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
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
        {task.description}
      </div>
      {task.commitSha && (
        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
          {task.commitSha.slice(0, 10)}{task.baseSha ? `  ← ${task.baseSha.slice(0, 10)}` : ''}
          {task.attempt > 0 && `  · attempt ${task.attempt}`}
        </div>
      )}
      {task.review && (
        <div
          style={{
            marginTop: 8,
            padding: '6px 8px',
            borderRadius: 4,
            background:
              task.review.verdict === 'pass'
                ? 'var(--bg-success-subtle, #eafaf1)'
                : 'var(--bg-danger-subtle, #fdecea)',
            fontSize: 11,
            color:
              task.review.verdict === 'pass'
                ? 'var(--text-success, #1b7a43)'
                : 'var(--text-danger, #c62828)',
          }}
        >
          <strong>review {task.review.verdict}:</strong> {task.review.notes}
        </div>
      )}
    </div>
  );
}

function StatusPill({
  kind,
  status,
}: {
  kind: 'job' | 'task';
  status: string;
}) {
  const color = pillColor(status);
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 999,
        background: color.bg,
        color: color.fg,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        whiteSpace: 'nowrap',
      }}
      aria-label={`${kind} status: ${status}`}
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
      return { bg: 'var(--bg-success-subtle, #eafaf1)', fg: 'var(--text-success, #1b7a43)' };
    case 'failed':
    case 'cancelled':
      return { bg: 'var(--bg-danger-subtle, #fdecea)', fg: 'var(--text-danger, #c62828)' };
    case 'paused':
    case 'blocked':
      return { bg: 'var(--bg-warn, #fff7e6)', fg: 'var(--text-warn, #8a5a00)' };
    case 'running':
    case 'delegating':
    case 'reviewing':
      return { bg: 'var(--bg-info-subtle, #e7f0fd)', fg: 'var(--text-info, #1453b6)' };
    default:
      return { bg: 'var(--bg-elevated)', fg: 'var(--text-secondary)' };
  }
}

// ── Styles ───────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  padding: '20px 24px',
  maxWidth: 720,
  margin: '0 auto',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 20,
};

const h2Style: React.CSSProperties = {
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--text-tertiary)',
  margin: '0 0 8px',
};

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-inverse, #fff)',
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  ...primaryBtn,
  color: 'var(--text-primary)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-primary)',
};

const dangerBtn: React.CSSProperties = {
  ...secondaryBtn,
  color: 'var(--text-danger, #c62828)',
};

const tinyBtn: React.CSSProperties = {
  padding: '3px 8px',
  fontSize: 10,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-primary)',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

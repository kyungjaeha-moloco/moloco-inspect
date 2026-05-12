import React, { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { API_BASE } from '../analytics/types';

/**
 * Job detail page — surfaces a single Inspect job's lifecycle so a user
 * jumping in from molly's "📊 Inspect Console ↗" link sees the right
 * context immediately. Each task in the job points to the existing
 * per-request detail page so the existing diff/review tooling still
 * applies.
 */

interface JobTask {
  id: string;
  title: string;
  description: string;
  status: string;
  attempt: number;
  changeRequestId?: string;
  commitSha?: string;
  review?: { verdict: 'pass' | 'fail'; notes: string };
}

interface Job {
  id: string;
  playgroundId: string;
  prdText: string;
  status: string;
  tasks: JobTask[];
  pausedReason?: string;
  qaStrategy?: string;
  qaRationale?: string;
  /** @deprecated use qaRationale — back-compat for old state files */
  qaRationaleKo?: string;
  qaAutoResult?: {
    strategy: string;
    passed: boolean;
    notes: string;
    ranAt: number;
  };
  targetRoute?: string;
  slackContext?: { channel: string; threadTs: string };
  createdAt: number;
  updatedAt: number;
}

function formatRelTime(ms: number) {
  const diff = Date.now() - ms;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ms).toLocaleString();
}

function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'complete':
    case 'reviewed':
    case 'committed':
      return { bg: 'rgba(27, 122, 67, 0.12)', fg: '#1b7a43' };
    case 'failed':
    case 'cancelled':
      return { bg: 'rgba(198, 40, 40, 0.12)', fg: '#c62828' };
    case 'paused':
    case 'blocked':
      return { bg: 'rgba(245, 194, 107, 0.2)', fg: '#8a5a00' };
    case 'running':
    case 'delegating':
    case 'reviewing':
    case 'decomposing':
    case 'qa':
      return { bg: 'rgba(20, 83, 182, 0.12)', fg: '#1453b6' };
    default:
      return { bg: '#f3f4f6', fg: '#6b7280' };
  }
}

function StatusPill({ status }: { status: string }) {
  const c = statusColor(status);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        background: c.bg,
        color: c.fg,
      }}
    >
      {status}
    </span>
  );
}

export function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [prdExpanded, setPrdExpanded] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/job/${encodeURIComponent(jobId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setJob(data.job);
        setError(null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchOnce();
    // 5s poll so the page stays live while a job runs.
    const id = setInterval(fetchOnce, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobId]);

  if (loading && !job) {
    return (
      <div className="rd-shell">
        <NavLink className="rd-back" to="/requests">
          &larr; Requests
        </NavLink>
        <div className="loading-state">Loading…</div>
      </div>
    );
  }
  if (error || !job) {
    return (
      <div className="rd-shell">
        <NavLink className="rd-back" to="/requests">
          &larr; Requests
        </NavLink>
        <div className="error-state">{error ?? 'Job not found'}</div>
      </div>
    );
  }

  const reviewedCount = job.tasks.filter((t) => t.status === 'reviewed').length;
  const skippedCount = job.tasks.filter((t) => t.status === 'skipped').length;
  const playgroundUrl = `http://localhost:4180/p/${encodeURIComponent(job.playgroundId)}`;

  return (
    <div className="rd-shell">
      <NavLink className="rd-back" to="/requests">
        &larr; Requests
      </NavLink>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Job {job.id}</h1>
          <StatusPill status={job.status} />
          {job.qaStrategy && (
            <span
              title={job.qaRationale ?? job.qaRationaleKo}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(20, 83, 182, 0.08)',
                color: '#1453b6',
                border: '1px solid rgba(20, 83, 182, 0.18)',
                cursor: (job.qaRationale ?? job.qaRationaleKo) ? 'help' : 'default',
              }}
            >
              🧪 {job.qaStrategy}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {reviewedCount}/{job.tasks.length} reviewed
          {skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
          {' · '}created {formatRelTime(job.createdAt)}
          {' · '}updated {formatRelTime(job.updatedAt)}
        </div>
      </div>

      {job.pausedReason && (
        <div
          style={{
            padding: '10px 12px',
            marginBottom: 16,
            background: '#fff7e6',
            border: '1px solid #f5c26b',
            borderRadius: 6,
            fontSize: 13,
            color: '#8a5a00',
          }}
        >
          ⏸ {job.pausedReason}
        </div>
      )}

      {/* QA auto result */}
      {job.qaAutoResult && (
        <div
          style={{
            padding: '10px 12px',
            marginBottom: 16,
            background: job.qaAutoResult.passed ? 'rgba(27, 122, 67, 0.08)' : 'rgba(198, 40, 40, 0.06)',
            border: `1px solid ${job.qaAutoResult.passed ? '#1b7a43' : '#c62828'}`,
            borderRadius: 6,
            fontSize: 13,
            color: job.qaAutoResult.passed ? '#1b7a43' : '#c62828',
          }}
        >
          🧪 자동 QA {job.qaAutoResult.passed ? '통과' : '실패'} — {job.qaAutoResult.notes}
        </div>
      )}

      {/* Job links */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <a
          href={playgroundUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            color: '#374151',
            textDecoration: 'none',
            fontSize: 13,
          }}
        >
          📺 Playground ↗
        </a>
        {job.targetRoute && (
          <span style={{ fontSize: 13, color: '#6b7280', alignSelf: 'center' }}>
            결과 페이지: <code>{job.targetRoute}</code>
          </span>
        )}
      </div>

      {/* PRD */}
      <details
        open={prdExpanded}
        onToggle={(e) => setPrdExpanded((e.target as HTMLDetailsElement).open)}
        style={{ marginBottom: 24, border: '1px solid #e5e7eb', borderRadius: 6 }}
      >
        <summary
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            background: '#f9fafb',
          }}
        >
          PRD ({job.prdText?.length ?? 0} chars)
        </summary>
        <pre
          style={{
            padding: 12,
            margin: 0,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            background: 'white',
            maxHeight: 400,
            overflow: 'auto',
          }}
        >
          {job.prdText}
        </pre>
      </details>

      {/* Tasks */}
      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Tasks ({job.tasks.length})</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {job.tasks.map((t, i) => (
          <div
            key={t.id}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: 12,
              background: 'white',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 12, color: '#9ca3af' }}>#{i + 1}</span>
              <strong style={{ fontSize: 14 }}>{t.title}</strong>
              <StatusPill status={t.status} />
              {t.attempt > 0 && (
                <span style={{ fontSize: 11, color: '#6b7280' }}>attempt {t.attempt + 1}</span>
              )}
              {t.changeRequestId && (
                <NavLink
                  to={`/requests/${encodeURIComponent(t.changeRequestId)}`}
                  style={{
                    marginLeft: 'auto',
                    fontSize: 12,
                    padding: '4px 10px',
                    background: '#1453b6',
                    color: 'white',
                    borderRadius: 4,
                    textDecoration: 'none',
                  }}
                >
                  Request detail →
                </NavLink>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#4b5563', whiteSpace: 'pre-wrap' }}>
              {t.description}
            </div>
            {t.review?.notes && (
              <div
                style={{
                  marginTop: 8,
                  padding: 8,
                  fontSize: 12,
                  background: t.review.verdict === 'pass' ? 'rgba(27, 122, 67, 0.06)' : 'rgba(198, 40, 40, 0.06)',
                  border: `1px solid ${t.review.verdict === 'pass' ? 'rgba(27, 122, 67, 0.2)' : 'rgba(198, 40, 40, 0.2)'}`,
                  borderRadius: 4,
                  color: t.review.verdict === 'pass' ? '#1b7a43' : '#c62828',
                }}
              >
                <strong>review {t.review.verdict}:</strong> {t.review.notes}
              </div>
            )}
            {t.commitSha && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                commit {t.commitSha.slice(0, 8)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

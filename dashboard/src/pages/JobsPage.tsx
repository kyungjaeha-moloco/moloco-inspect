import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { API_BASE } from '../analytics/types';

/**
 * Jobs index — top-level view for the PRD-driven workflow.
 *
 * Each job groups N tasks; each task spawns 1+ change-requests. This
 * page is the natural entry point for users coming from molly's Slack
 * thread or the Playground app — they think in jobs, not raw requests.
 *
 * The /requests page is still the place to look at every change-
 * request the orchestrator has ever processed (including the jobless
 * ones from the Chrome extension and direct playground edits). This
 * page just hides that complexity behind a job-shaped lens.
 */

interface JobSummary {
  id: string;
  playgroundId: string;
  prdText: string;
  status: string;
  tasks: Array<{ id: string; status: string }>;
  pausedReason?: string;
  qaStrategy?: string;
  qaAutoResult?: { passed: boolean; notes: string };
  targetRoute?: string;
  slackContext?: { channel: string; threadTs: string };
  createdAt: number;
  updatedAt: number;
}

const ACTIVE_STATUSES = new Set([
  'decomposing',
  'planning',
  'delegating',
  'reviewing',
  'paused',
  'qa',
]);
const TERMINAL_STATUSES = new Set(['complete', 'cancelled']);

type StatusFilter = 'all' | 'active' | 'complete' | 'cancelled' | 'paused';

function formatRelTime(ms: number) {
  const diff = Date.now() - ms;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
}

function statusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case 'complete':
      return { bg: 'rgba(27, 122, 67, 0.12)', fg: '#1b7a43' };
    case 'cancelled':
      return { bg: 'rgba(198, 40, 40, 0.12)', fg: '#c62828' };
    case 'paused':
    case 'blocked':
      return { bg: 'rgba(245, 194, 107, 0.2)', fg: '#8a5a00' };
    case 'qa':
    case 'delegating':
    case 'reviewing':
    case 'decomposing':
    case 'planning':
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

function progressFor(job: JobSummary) {
  const reviewed = job.tasks.filter((t) => t.status === 'reviewed').length;
  const skipped = job.tasks.filter((t) => t.status === 'skipped').length;
  const total = job.tasks.length;
  return { reviewed, skipped, total };
}

function jobSourceLabel(job: JobSummary): string | null {
  if (job.slackContext) return 'Slack';
  // Future: detect playground-app vs Chrome ext source if/when we
  // start stamping it. For now non-Slack jobs come from the Playground
  // app's PRD textarea.
  return 'Playground';
}

export function JobsPage() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/job`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
        setError(null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchOnce();
    const id = setInterval(fetchOnce, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    let list = [...jobs];
    if (filter === 'active') list = list.filter((j) => ACTIVE_STATUSES.has(j.status));
    else if (filter === 'complete') list = list.filter((j) => j.status === 'complete');
    else if (filter === 'cancelled') list = list.filter((j) => j.status === 'cancelled');
    else if (filter === 'paused') list = list.filter((j) => j.status === 'paused');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (j) =>
          j.id.toLowerCase().includes(q) ||
          (j.prdText ?? '').toLowerCase().includes(q) ||
          (j.playgroundId ?? '').toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [jobs, filter, search]);

  const counts = useMemo(() => {
    return {
      total: jobs.length,
      active: jobs.filter((j) => ACTIVE_STATUSES.has(j.status)).length,
      complete: jobs.filter((j) => j.status === 'complete').length,
      cancelled: jobs.filter((j) => j.status === 'cancelled').length,
      paused: jobs.filter((j) => j.status === 'paused').length,
    };
  }, [jobs]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Jobs</h1>
        <p className="page-subtitle">
          PRD 단위 작업 묶음. 각 잡은 N task 로 쪼개지고, 각 task 가 1개 이상의 change-request 를
          만듭니다. raw 한 단위가 보고 싶으면{' '}
          <NavLink to="/requests" style={{ color: 'var(--accent)' }}>
            Requests
          </NavLink>{' '}
          탭으로.
        </p>
      </div>

      {/* Filter + search row */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {(['all', 'active', 'paused', 'complete', 'cancelled'] as const).map((f) => {
          const c =
            f === 'all'
              ? counts.total
              : f === 'active'
                ? counts.active
                : f === 'paused'
                  ? counts.paused
                  : f === 'complete'
                    ? counts.complete
                    : counts.cancelled;
          const isActive = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid',
                borderColor: isActive ? '#1453b6' : '#d1d5db',
                background: isActive ? 'rgba(20, 83, 182, 0.08)' : 'white',
                color: isActive ? '#1453b6' : '#374151',
                cursor: 'pointer',
              }}
            >
              {f} ({c})
            </button>
          );
        })}
        <input
          type="text"
          placeholder="search id / PRD / playground…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 180,
            padding: '6px 10px',
            fontSize: 13,
            border: '1px solid #d1d5db',
            borderRadius: 6,
            background: 'white',
          }}
        />
      </div>

      {loading && jobs.length === 0 && <div className="loading-state">Loading…</div>}
      {error && <div className="error-state">{error}</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
          {jobs.length === 0 ? 'No jobs yet.' : 'No jobs match this filter.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((job) => {
          const { reviewed, skipped, total } = progressFor(job);
          const headLine = (job.prdText ?? '').split('\n')[0]?.trim() || '(no PRD)';
          const source = jobSourceLabel(job);
          return (
            <NavLink
              key={job.id}
              to={`/jobs/${encodeURIComponent(job.id)}`}
              style={{
                display: 'block',
                padding: 12,
                border: '1px solid #e5e7eb',
                borderRadius: 6,
                background: 'white',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                <code style={{ fontSize: 12, color: '#6b7280' }}>{job.id}</code>
                <StatusPill status={job.status} />
                {job.qaStrategy && (
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: 'rgba(20, 83, 182, 0.08)',
                      color: '#1453b6',
                      border: '1px solid rgba(20, 83, 182, 0.18)',
                    }}
                  >
                    🧪 {job.qaStrategy}
                  </span>
                )}
                {source && (
                  <span style={{ fontSize: 11, color: '#6b7280' }}>· {source}</span>
                )}
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  · {reviewed}/{total} reviewed{skipped > 0 ? ` (${skipped} skipped)` : ''}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af' }}>
                  {formatRelTime(job.updatedAt)}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.4 }}>
                {headLine.length > 220 ? `${headLine.slice(0, 220)}…` : headLine}
              </div>
              {job.pausedReason && (
                <div
                  style={{
                    marginTop: 6,
                    padding: '4px 8px',
                    fontSize: 11,
                    background: '#fff7e6',
                    color: '#8a5a00',
                    borderRadius: 4,
                  }}
                >
                  ⏸ {job.pausedReason.slice(0, 200)}
                </div>
              )}
            </NavLink>
          );
        })}
      </div>
    </>
  );
}

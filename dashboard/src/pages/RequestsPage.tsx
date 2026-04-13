import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3847';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AnalyticsSummary = {
  totalRequests: number;
  statusCounts: Record<string, number>;
  approvalRate: number;
  noChangeNeededRate: number;
  averageDurationMs: number | null;
  topRoutes: Array<{ route: string; count: number }>;
  topFiles: Array<{ file: string; count: number }>;
  hourlyBuckets: Array<{
    hour: string;
    total: number;
    approved: number;
    noChangeNeeded: number;
    averageDurationMs: number;
  }>;
};

type AnalyticsRecord = {
  id: string;
  status: string;
  approvalState?: string | null;
  pagePath?: string | null;
  client?: string | null;
  language?: string | null;
  requestedChange?: string | null;
  changedFiles?: string[];
  screenshotUrl?: string | null;
  previewUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  durationMs?: number | null;
  iterationCount?: number | null;
};

type ViewMode = 'list' | 'pipeline';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms <= 0) return '\u2014';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return remain ? `${minutes}m ${remain}s` : `${minutes}m`;
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '\u2014';
  return `${Math.round(value * 100)}%`;
}

function getStatusBadgeClass(status: string): string {
  if (status === 'completed') return 'badge badge-success';
  if (status === 'error' || status === 'failed') return 'badge badge-danger';
  if (status === 'in-progress' || status === 'processing') return 'badge badge-info';
  return 'badge badge-neutral';
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '\u2026';
}

/** Classify a raw status into a pipeline column key */
function toPipelineColumn(status: string): 'pending' | 'processing' | 'completed' | 'error' {
  if (status === 'completed') return 'completed';
  if (status === 'error' || status === 'failed') return 'error';
  if (status === 'in-progress' || status === 'processing') return 'processing';
  return 'pending';
}

/* ------------------------------------------------------------------ */
/*  Data hook                                                          */
/* ------------------------------------------------------------------ */

function useAnalyticsDashboardData() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [records, setRecords] = useState<AnalyticsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, recordsRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/summary`),
        fetch(`${API_BASE}/api/analytics/requests?limit=500`),
      ]);
      if (!summaryRes.ok) throw new Error(`Summary returned ${summaryRes.status}`);
      if (!recordsRes.ok) throw new Error(`Requests returned ${recordsRes.status}`);
      const summaryJson = await summaryRes.json();
      const recordsJson = await recordsRes.json();
      setSummary(summaryJson.summary ?? null);
      setRecords(recordsJson.records ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
      setSummary(null);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!cancelled) void load();
    const interval = setInterval(() => {
      if (!cancelled) void load();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [load]);

  return { summary, records, loading, error, reload: load };
}

/* ------------------------------------------------------------------ */
/*  Unique status values for the filter dropdown                       */
/* ------------------------------------------------------------------ */

function collectStatuses(records: AnalyticsRecord[]): string[] {
  const set = new Set<string>();
  for (const r of records) set.add(r.status);
  return Array.from(set).sort();
}

/* ------------------------------------------------------------------ */
/*  Pipeline column definitions                                        */
/* ------------------------------------------------------------------ */

const PIPELINE_COLUMNS: Array<{
  key: 'pending' | 'processing' | 'completed' | 'error';
  title: string;
  stageClass: string;
}> = [
  { key: 'pending', title: 'Pending', stageClass: 'stage-pending' },
  { key: 'processing', title: 'Processing', stageClass: 'stage-processing' },
  { key: 'completed', title: 'Completed', stageClass: 'stage-completed' },
  { key: 'error', title: 'Error', stageClass: 'stage-error' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function RequestsPage() {
  const { summary, records, loading, error } = useAnalyticsDashboardData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState<ViewMode>('list');

  const statuses = useMemo(() => collectStatuses(records), [records]);

  const filtered = useMemo(() => {
    let list = records;
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          (r.requestedChange ?? '').toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          (r.pagePath ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [records, statusFilter, search]);

  /** Group filtered records into pipeline columns */
  const pipelineGroups = useMemo(() => {
    const groups: Record<string, AnalyticsRecord[]> = {
      pending: [],
      processing: [],
      completed: [],
      error: [],
    };
    for (const record of filtered) {
      const col = toPipelineColumn(record.status);
      groups[col].push(record);
    }
    return groups;
  }, [filtered]);

  /* ---- Loading state ---- */
  if (loading && !summary) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Requests</h1>
          <p className="page-subtitle">Chrome Extension request history and operational metrics</p>
        </div>
        <div className="loading-state">Loading request data...</div>
      </>
    );
  }

  /* ---- Error state ---- */
  if (error && !summary) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Requests</h1>
          <p className="page-subtitle">Chrome Extension request history and operational metrics</p>
        </div>
        <div className="error-state">Failed to load analytics: {error}</div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Requests</h1>
        <p className="page-subtitle">Chrome Extension request history and operational metrics</p>
      </div>

      {/* Stat cards */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{summary?.totalRequests ?? 0}</div>
          <div className="stat-label">Total Requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatPercent(summary?.approvalRate)}</div>
          <div className="stat-label">Approval Rate</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatDuration(summary?.averageDurationMs)}</div>
          <div className="stat-label">Avg Processing Time</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatPercent(summary?.noChangeNeededRate)}</div>
          <div className="stat-label">No Change Rate</div>
        </div>
      </div>

      {/* Filter bar + view toggle */}
      <div className="filter-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Search requests..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="view-toggle">
          <button
            className={`view-toggle-btn${view === 'list' ? ' active' : ''}`}
            onClick={() => setView('list')}
            type="button"
          >
            List
          </button>
          <button
            className={`view-toggle-btn${view === 'pipeline' ? ' active' : ''}`}
            onClick={() => setView('pipeline')}
            type="button"
          >
            Pipeline
          </button>
        </div>
      </div>

      {/* List view */}
      {view === 'list' && (
        <>
          {filtered.length === 0 ? (
            <div className="empty-state">
              {records.length === 0
                ? 'No requests recorded yet.'
                : 'No requests match the current filters.'}
            </div>
          ) : (
            <div className="data-table" style={{ gridTemplateColumns: '1fr 100px 80px 80px' }}>
              <div className="data-table-head">
                <span>Request</span>
                <span>Status</span>
                <span>Duration</span>
                <span>Files</span>
              </div>
              {filtered.map((record) => (
                <NavLink
                  key={record.id}
                  className="data-table-row link"
                  to={`/requests/${record.id}`}
                >
                  <span className="truncate">
                    {record.requestedChange
                      ? truncate(record.requestedChange, 80)
                      : <span className="mono">{truncate(record.id, 20)}</span>}
                  </span>
                  <span>
                    <span className={getStatusBadgeClass(record.status)}>{record.status}</span>
                  </span>
                  <span className="mono">{formatDuration(record.durationMs)}</span>
                  <span className="mono">{record.changedFiles?.length ?? 0}</span>
                </NavLink>
              ))}
            </div>
          )}
        </>
      )}

      {/* Pipeline view */}
      {view === 'pipeline' && (
        <div className="pipeline-board">
          {PIPELINE_COLUMNS.map((col) => {
            const items = pipelineGroups[col.key];
            return (
              <div className={`pipeline-column ${col.stageClass}`} key={col.key}>
                <div className="pipeline-column-header">
                  <span className="pipeline-column-title">{col.title}</span>
                  <span className="pipeline-column-count">{items.length}</span>
                </div>
                {items.map((record) => (
                  <NavLink
                    key={record.id}
                    className="pipeline-card link"
                    to={`/requests/${record.id}`}
                  >
                    <div className="row-title">
                      {record.requestedChange
                        ? truncate(record.requestedChange, 60)
                        : 'Untitled request'}
                    </div>
                    <div className="pipeline-card-id mono">{truncate(record.id, 20)}</div>
                  </NavLink>
                ))}
                {items.length === 0 && (
                  <div className="empty-state">No requests</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

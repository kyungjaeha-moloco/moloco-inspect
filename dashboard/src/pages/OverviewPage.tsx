import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3847';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type OverviewProps = {
  totalComponents: number;
  totalCategories: number;
  dependencyCoverageCount: number;
};

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

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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

/** Map raw status strings to pipeline stage labels */
function mapStatusToStage(status: string): { label: string; dotClass: string } {
  if (status === 'completed') return { label: 'Done', dotClass: 'done' };
  if (status === 'error' || status === 'failed') return { label: 'Error', dotClass: 'blocked' };
  if (status === 'in-progress' || status === 'processing') return { label: 'In Progress', dotClass: 'progress' };
  return { label: 'Pending', dotClass: 'backlog' };
}

/* ------------------------------------------------------------------ */
/*  Data hook                                                          */
/* ------------------------------------------------------------------ */

function useOverviewData() {
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

  return { summary, records, loading, error };
}

/* ------------------------------------------------------------------ */
/*  Pipeline status aggregation                                        */
/* ------------------------------------------------------------------ */

function aggregateStages(statusCounts: Record<string, number>): Array<{ label: string; dotClass: string; count: number }> {
  const stageMap: Record<string, { dotClass: string; count: number }> = {
    Pending: { dotClass: 'backlog', count: 0 },
    'In Progress': { dotClass: 'progress', count: 0 },
    Done: { dotClass: 'done', count: 0 },
    Error: { dotClass: 'blocked', count: 0 },
  };

  for (const [status, count] of Object.entries(statusCounts)) {
    const { label } = mapStatusToStage(status);
    if (stageMap[label]) {
      stageMap[label].count += count;
    }
  }

  return Object.entries(stageMap)
    .filter(([, v]) => v.count > 0)
    .map(([label, v]) => ({ label, dotClass: v.dotClass, count: v.count }));
}

/* ------------------------------------------------------------------ */
/*  Chart: Hourly Throughput (Bar + Line)                              */
/* ------------------------------------------------------------------ */

const CHART_COLORS = {
  bar: '#818cf8',
  barNoChange: 'rgba(251,191,36,0.5)',
  line: '#f87171',
  grid: 'rgba(255,255,255,0.06)',
  axis: 'rgba(255,255,255,0.35)',
  tooltipBg: '#27272a',
  tooltipBorder: 'rgba(255,255,255,0.1)',
};

function HourlyChart({ buckets }: { buckets: AnalyticsSummary['hourlyBuckets'] }) {
  const data = useMemo(
    () =>
      buckets.slice(-12).map((b) => ({
        ...b,
        label: new Date(b.hour).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        durationSec: Math.round(b.averageDurationMs / 1000),
      })),
    [buckets],
  );

  if (!data.length) {
    return <div className="empty-state">No hourly data yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="count"
          tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="dur"
          orientation="right"
          tick={{ fill: CHART_COLORS.line, fontSize: 11 }}
          tickFormatter={(v) => `${v}s`}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: CHART_COLORS.tooltipBg,
            border: `1px solid ${CHART_COLORS.tooltipBorder}`,
            borderRadius: 6,
            fontSize: 12,
            color: 'rgba(255,255,255,0.88)',
          }}
          formatter={(value: number, name: string) => {
            if (name === 'Avg Time') return `${value}s`;
            return value;
          }}
        />
        <Bar yAxisId="count" dataKey="total" fill={CHART_COLORS.bar} name="Requests" radius={[3, 3, 0, 0]} barSize={20} />
        <Bar yAxisId="count" dataKey="noChangeNeeded" fill={CHART_COLORS.barNoChange} name="No Change" radius={[3, 3, 0, 0]} barSize={20} />
        <Line
          yAxisId="dur"
          type="monotone"
          dataKey="durationSec"
          stroke={CHART_COLORS.line}
          strokeWidth={2}
          dot={{ r: 3, fill: CHART_COLORS.line }}
          name="Avg Time"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Chart: Status Distribution (Donut)                                 */
/* ------------------------------------------------------------------ */

const DONUT_COLORS: Record<string, string> = {
  Done: '#4ade80',
  Error: '#f87171',
  'In Progress': '#818cf8',
  Pending: '#71717a',
  'No Change': '#fbbf24',
};

function StatusDonut({ statusCounts, noChangeNeededRate, totalRequests }: {
  statusCounts: Record<string, number>;
  noChangeNeededRate: number;
  totalRequests: number;
}) {
  const stages = aggregateStages(statusCounts);

  // Add "No Change" slice from the rate
  const noChangeCount = Math.round(noChangeNeededRate * totalRequests);
  if (noChangeCount > 0) {
    stages.push({ label: 'No Change', dotClass: 'warning', count: noChangeCount });
  }

  if (!stages.length) {
    return <div className="empty-state">No data yet.</div>;
  }

  const data = stages.map((s) => ({ name: s.label, value: s.count }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={DONUT_COLORS[entry.name] || '#71717a'} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: CHART_COLORS.tooltipBg,
              border: `1px solid ${CHART_COLORS.tooltipBorder}`,
              borderRadius: 6,
              fontSize: 12,
              color: 'rgba(255,255,255,0.88)',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        {data.map((d) => (
          <div className="chart-legend-item" key={d.name}>
            <span className="chart-legend-dot" style={{ background: DONUT_COLORS[d.name] || '#71717a' }} />
            <span className="chart-legend-label">{d.name}</span>
            <span className="chart-legend-value">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function OverviewPage({ totalComponents, totalCategories, dependencyCoverageCount }: OverviewProps) {
  const { summary, records, loading, error } = useOverviewData();

  const recentRequests = records.slice(0, 5);
  const topRoutes = (summary?.topRoutes ?? []).slice(0, 5);
  const stages = summary ? aggregateStages(summary.statusCounts) : [];
  const apiUnavailable = !loading && error !== null;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">
          Request pipeline health and system status at a glance.
        </p>
      </div>

      {/* Section 1: Request Pipeline Summary */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Request Pipeline</h2>
        </div>

        {loading && !summary && (
          <div className="loading-state">Loading pipeline data...</div>
        )}

        {apiUnavailable && (
          <div className="empty-state">
            Orchestrator not connected. Start the server to see request data.
          </div>
        )}

        {summary && (
          <>
            <div className="stat-row">
              <div className="stat-card">
                <div className="stat-value">{summary.totalRequests}</div>
                <div className="stat-label">Total Requests</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{formatPercent(summary.approvalRate)}</div>
                <div className="stat-label">Approval Rate</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{formatDuration(summary.averageDurationMs)}</div>
                <div className="stat-label">Avg Processing</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{formatPercent(summary.noChangeNeededRate)}</div>
                <div className="stat-label">No Change Rate</div>
              </div>
            </div>

            {stages.length > 0 && (
              <div className="status-counts">
                {stages.map((stage) => (
                  <div className="status-count" key={stage.label}>
                    <span className={`status-dot ${stage.dotClass}`} />
                    {stage.label} {stage.count}
                  </div>
                ))}
              </div>
            )}

            {/* Charts row */}
            <div className="chart-row">
              <div className="chart-panel chart-panel-wide">
                <div className="chart-panel-title">Hourly Throughput</div>
                <HourlyChart buckets={summary.hourlyBuckets ?? []} />
              </div>
              <div className="chart-panel chart-panel-narrow">
                <div className="chart-panel-title">Status Distribution</div>
                <StatusDonut
                  statusCounts={summary.statusCounts}
                  noChangeNeededRate={summary.noChangeNeededRate}
                  totalRequests={summary.totalRequests}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Section 2: System Stats */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">System Stats</h2>
        </div>
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-value">{totalComponents}</div>
            <div className="stat-label">Components</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{totalCategories}</div>
            <div className="stat-label">Categories</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{dependencyCoverageCount}</div>
            <div className="stat-label">Dependencies</div>
          </div>
        </div>
      </div>

      {/* Section 3: Recent Requests */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Recent Requests</h2>
          <NavLink className="section-action link" to="/requests">
            View all &rarr;
          </NavLink>
        </div>

        {apiUnavailable && (
          <div className="empty-state">
            Orchestrator not connected. Start the server to see request data.
          </div>
        )}

        {!apiUnavailable && recentRequests.length === 0 && !loading && (
          <div className="empty-state">No requests recorded yet.</div>
        )}

        {recentRequests.map((record) => (
          <NavLink className="list-row link" to={`/requests/${record.id}`} key={record.id}>
            <span className={getStatusBadgeClass(record.status)}>{record.status}</span>
            <span className="row-title">
              {record.requestedChange
                ? truncate(record.requestedChange, 60)
                : <span className="mono">{truncate(record.id, 20)}</span>}
            </span>
            <span className="row-meta mono">{formatDuration(record.durationMs)}</span>
            <span className="row-meta">{timeAgo(record.createdAt)}</span>
          </NavLink>
        ))}
      </div>

      {/* Section 4: Top Routes */}
      {topRoutes.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Top Routes</h2>
          </div>
          {topRoutes.map((route) => (
            <div className="list-row" key={route.route}>
              <span className="row-title mono">{route.route}</span>
              <span className="row-meta">{route.count}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

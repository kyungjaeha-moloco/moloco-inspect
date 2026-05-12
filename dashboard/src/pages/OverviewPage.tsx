import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { API_BASE, AnalyticsRecord } from '../analytics/types';
import { formatDuration, formatPercent, getStatusBadgeClass, truncate } from '../analytics/helpers';
import { useAnalyticsDashboardData } from '../analytics/hooks';

/* ------------------------------------------------------------------ */
/*  Docker / Sandbox Status                                            */
/* ------------------------------------------------------------------ */

type SandboxInfo = {
  name: string;
  status: string;
  ports: string;
};

function useSandboxStatus() {
  const [sandboxes, setSandboxes] = useState<SandboxInfo[]>([]);
  const [orchestratorUp, setOrchestratorUp] = useState<boolean | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
      setOrchestratorUp(res.ok);
    } catch {
      setOrchestratorUp(false);
    }
    try {
      const res = await fetch(`${API_BASE}/api/sandboxes`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        setSandboxes(data.sandboxes ?? []);
      }
    } catch { /* sandboxes endpoint may not exist yet */ }
  }, []);

  useEffect(() => {
    void check();
    const interval = setInterval(check, 15_000);
    return () => clearInterval(interval);
  }, [check]);

  return { sandboxes, orchestratorUp };
}

/* ------------------------------------------------------------------ */
/*  Request Card (Vercel deploy card style)                            */
/* ------------------------------------------------------------------ */

function RequestCard({ record }: { record: AnalyticsRecord }) {
  const statusColor =
    record.status === 'preview' || record.status === 'completed' || record.status === 'approved'
      ? 'var(--success)'
      : record.status === 'error'
        ? 'var(--danger)'
        : record.status === 'processing'
          ? 'var(--accent)'
          : 'var(--text-muted)';

  return (
    <NavLink className="request-card" to={`/requests/${record.id}`}>
      <div className="request-card-main">
        <span className="request-card-dot" style={{ background: statusColor }} />
        <div className="request-card-content">
          <div className="request-card-title">
            {record.requestedChange ? truncate(record.requestedChange, 60) : 'Untitled request'}
          </div>
          <div className="request-card-meta">
            <span className="mono">{record.id.slice(0, 8)}</span>
            <span>·</span>
            <span>{record.pagePath || '/'}</span>
            <span>·</span>
            <span>{record.client || 'unknown'}</span>
          </div>
        </div>
      </div>
      <div className="request-card-right">
        <span className={getStatusBadgeClass(record.status)}>{record.status}</span>
        <span className="request-card-time">{formatDuration(record.durationMs)}</span>
      </div>
    </NavLink>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent Job Row (mirrors RequestCard for visual consistency)         */
/* ------------------------------------------------------------------ */

function RecentJobRow({ job }: { job: OverviewJob }) {
  const reviewed = job.tasks.filter((t) => t.status === 'reviewed').length;
  const total = job.tasks.length;
  const headLine = (job.prdText || '').split('\n')[0]?.trim() || '(no PRD)';
  const dotColor =
    job.status === 'complete'
      ? 'var(--success)'
      : job.status === 'cancelled' || job.status === 'paused' || job.status === 'blocked'
        ? 'var(--danger)'
        : job.status === 'qa' ||
            job.status === 'delegating' ||
            job.status === 'reviewing' ||
            job.status === 'decomposing' ||
            job.status === 'planning'
          ? 'var(--accent)'
          : 'var(--text-muted)';
  const elapsedMs = (job.status === 'complete' ? job.updatedAt : Date.now()) - job.createdAt;
  return (
    <NavLink className="request-card" to={`/jobs/${encodeURIComponent(job.id)}`}>
      <div className="request-card-main">
        <span className="request-card-dot" style={{ background: dotColor }} />
        <div className="request-card-content">
          <div className="request-card-title">
            {truncate(headLine, 70)}
          </div>
          <div className="request-card-meta">
            <span className="mono">{job.id.slice(0, 8)}</span>
            <span>·</span>
            <span>
              {reviewed}/{total} reviewed
            </span>
            {job.qaStrategy && (
              <>
                <span>·</span>
                <span>🧪 {job.qaStrategy}</span>
              </>
            )}
            <span>·</span>
            <span className="mono">{job.playgroundId.slice(0, 8)}</span>
          </div>
        </div>
      </div>
      <div className="request-card-right">
        <span className={getStatusBadgeClass(job.status)}>{job.status}</span>
        <span className="request-card-time">{formatDuration(elapsedMs)}</span>
      </div>
    </NavLink>
  );
}

/* ------------------------------------------------------------------ */
/*  Coverage Bar Chart                                                 */
/* ------------------------------------------------------------------ */

/** Extract a short page name from a full route path */
function shortPageName(route: string): string {
  // /v1/p/TVING_OMS/oms/order?type=available → OMS / Order
  const cleaned = route.replace(/^\/v1\/p\/[^/]+\//, '').replace(/\?.*$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length === 0) return route;
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' ')).join(' / ');
}

function CoverageChart({ routes }: { routes: Array<{ route: string; count: number }> }) {
  const filtered = routes.filter(r => r.route !== '/test' && r.route !== '/t' && r.route !== '/hello').slice(0, 6);
  const total = filtered.reduce((sum, r) => sum + r.count, 0) || 1;

  if (filtered.length === 0) {
    return <div className="empty-state" style={{ padding: '24px 0' }}>No route data yet.</div>;
  }

  return (
    <div className="coverage-list">
      {filtered.map(r => {
        const pct = Math.round((r.count / total) * 100);
        return (
          <div key={r.route} className="coverage-item">
            <div className="coverage-item-header">
              <span className="coverage-page-name">{shortPageName(r.route)}</span>
              <span className="coverage-count">{r.count} requests ({pct}%)</span>
            </div>
            <div className="coverage-bar">
              <div className="coverage-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Daily Trend Chart                                                  */
/* ------------------------------------------------------------------ */

type DailyBucket = { date: string; label: string; total: number; success: number; rate: number };

function buildDailyBuckets(records: AnalyticsRecord[], days = 7): DailyBucket[] {
  // Build map from records
  const map = new Map<string, { total: number; success: number }>();
  for (const r of records) {
    const date = (r.createdAt || '').slice(0, 10);
    if (!date) continue;
    if (!map.has(date)) map.set(date, { total: 0, success: 0 });
    const d = map.get(date)!;
    d.total++;
    if (r.status === 'preview' || r.status === 'completed' || r.status === 'approved') d.success++;
  }
  // Fill in missing days with zeros
  const buckets: DailyBucket[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const data = map.get(date) || { total: 0, success: 0 };
    buckets.push({
      date,
      label: d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      total: data.total,
      success: data.success,
      rate: data.total > 0 ? Math.round((data.success / data.total) * 100) : 0,
    });
  }
  return buckets;
}

function DailyTrendChart({ records }: { records: AnalyticsRecord[] }) {
  const [range, setRange] = useState(7);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const buckets = useMemo(() => {
    if (showCustom && customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      // Build buckets from custom start
      const map = new Map<string, { total: number; success: number }>();
      for (const r of records) {
        const date = (r.createdAt || '').slice(0, 10);
        if (!date) continue;
        if (!map.has(date)) map.set(date, { total: 0, success: 0 });
        const d = map.get(date)!;
        d.total++;
        if (r.status === 'preview' || r.status === 'completed' || r.status === 'approved') d.success++;
      }
      const result: DailyBucket[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const date = d.toISOString().slice(0, 10);
        const data = map.get(date) || { total: 0, success: 0 };
        result.push({
          date,
          label: d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
          total: data.total,
          success: data.success,
          rate: data.total > 0 ? Math.round((data.success / data.total) * 100) : 0,
        });
      }
      return result;
    }
    return buildDailyBuckets(records, range);
  }, [records, range, showCustom, customStart, customEnd]);

  if (buckets.length === 0) {
    return <div className="empty-state" style={{ padding: '24px 0' }}>Not enough data yet.</div>;
  }

  const data = buckets.map(b => ({
    ...b,
    other: b.total - b.success,
  }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="daily-range-controls">
        <div className="daily-range-presets">
          {[7, 14, 30].map(d => (
            <button
              key={d}
              className={`daily-range-btn${!showCustom && range === d ? ' active' : ''}`}
              onClick={() => { setRange(d); setShowCustom(false); }}
            >
              {d}D
            </button>
          ))}
        </div>
        <div className="daily-range-custom">
          <input
            type="date"
            className="daily-range-input"
            value={customStart}
            max={today}
            onChange={e => { setCustomStart(e.target.value); setShowCustom(true); }}
          />
          <span style={{ color: 'var(--text-muted)' }}>–</span>
          <input
            type="date"
            className="daily-range-input"
            value={customEnd || today}
            max={today}
            onChange={e => { setCustomEnd(e.target.value); setShowCustom(true); }}
          />
        </div>
      </div>
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          yAxisId="count"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="rate"
          orientation="right"
          domain={[0, 100]}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v) => `${v}%`}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--text-primary)',
          }}
          formatter={(value: number, name: string) => {
            if (name === 'Success Rate') return `${value}%`;
            return value;
          }}
        />
        <Bar yAxisId="count" dataKey="success" stackId="a" fill="var(--success)" name="Success" radius={[0, 0, 0, 0]} />
        <Bar yAxisId="count" dataKey="other" stackId="a" fill="var(--border)" name="Other" radius={[3, 3, 0, 0]} />
        <Line
          yAxisId="rate"
          type="monotone"
          dataKey="rate"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--accent)' }}
          name="Success Rate"
        />
      </ComposedChart>
    </ResponsiveContainer>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent Performance Chart                                            */
/* ------------------------------------------------------------------ */

function AgentPerformanceChart({ statusCounts, total }: { statusCounts: Record<string, number>; total: number }) {
  const segments = [
    { key: 'preview', label: 'Preview Ready', color: '#24a148' },
    { key: 'completed', label: 'Applied', color: '#198038' },
    { key: 'no_change_needed', label: 'No Change', color: '#f1c21b' },
    { key: 'processing', label: 'Processing', color: '#0f62fe' },
    { key: 'pending', label: 'Pending', color: '#8d8d8d' },
    { key: 'error', label: 'Error', color: '#da1e28' },
  ].map(s => ({ ...s, value: statusCounts[s.key] ?? 0 })).filter(s => s.value > 0);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '16px 0' }}>
      {/* Recharts Donut */}
      <div style={{ position: 'relative', width: 150, height: 150, flexShrink: 0 }}>
        <PieChart width={150} height={150} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={segments.length > 0 ? segments : [{ key: 'empty', value: 1, color: '#e0e0e0', label: 'Empty' }]}
            dataKey="value"
            cx="50%" cy="50%"
            innerRadius={44} outerRadius={68}
            paddingAngle={segments.length > 1 ? 2 : 0}
            strokeWidth={0}
          >
            {(segments.length > 0 ? segments : [{ key: 'empty', color: '#e0e0e0' }]).map((s) => (
              <Cell key={s.key} fill={s.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, _name: string, props: any) => [`${value} (${total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)`, props.payload.label || '']}
            contentStyle={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 12, zIndex: 10 }}
            wrapperStyle={{ zIndex: 10 }}
          />
        </PieChart>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>{total}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</span>
        </div>
      </div>
      {/* Legend — right side */}
      <div className="agent-perf-legend">
        {segments.map(s => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <div key={s.key} className="agent-perf-chip">
              <span className="agent-perf-dot" style={{ background: s.color }} />
              <span className="agent-perf-chip-label">{s.label}</span>
              <span className="agent-perf-chip-value">{s.value}</span>
              <span className="agent-perf-chip-pct">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LLM Cost Section                                                   */
/* ------------------------------------------------------------------ */

type CostWindow = '24h' | '7d' | '30d';

type CostData = {
  window: CostWindow;
  total_usd: number;
  by_model: Record<string, { calls: number; tokens: number; usd: number }>;
  by_source: Record<string, { calls: number; usd: number }>;
  hourly_series: Array<{ hour: string; usd: number }>;
  unknown_model_calls: number;
};

const WINDOW_LABELS: Record<CostWindow, string> = {
  '24h': 'Today',
  '7d': '7d',
  '30d': '30d',
};

function fmtUsd(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 10) return `$${n.toFixed(1)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function shortModelLabel(modelId: string): string {
  if (modelId.startsWith('claude-haiku')) return 'Haiku 4.5';
  if (modelId === 'claude-sonnet-4-20250514') return 'Sonnet 4 (deprecated)';
  if (modelId.startsWith('claude-sonnet-4-5')) return 'Sonnet 4.5';
  if (modelId === 'claude-sonnet-4-6') return 'Sonnet 4.6';
  if (modelId.startsWith('claude-opus-4-5')) return 'Opus 4.5';
  if (modelId === 'claude-opus-4-6') return 'Opus 4.6';
  if (modelId === 'claude-opus-4-7') return 'Opus 4.7';
  return modelId.slice(0, 28);
}

function shortSourceLabel(source: string): string {
  return source
    .replace(/^molly-/, '')
    .replace('plan-emitter', 'plan emitter')
    .replace('prd-analyzer', 'PRD analyzer');
}

function useCostData(window: CostWindow) {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/molly/cost?window=${window}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (cancelled) return;
        if (j.ok === false) throw new Error(j.error || 'cost endpoint error');
        setData(j as CostData);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    setLoading(true);
    void fetchOnce();
    const id = setInterval(fetchOnce, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [window]);

  return { data, loading, error };
}

function CostBar({
  rows,
  total,
}: {
  rows: Array<{ key: string; label: string; usd: number; calls: number }>;
  total: number;
}) {
  if (rows.length === 0) {
    return <div className="empty-state" style={{ padding: '12px 0' }}>No data</div>;
  }
  return (
    <div className="coverage-list">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.usd / total) * 100) : 0;
        return (
          <div key={r.key} className="coverage-item">
            <div className="coverage-item-header">
              <span className="coverage-page-name">{r.label}</span>
              <span className="coverage-count">
                {fmtUsd(r.usd)} · {r.calls} call{r.calls !== 1 ? 's' : ''} ({pct}%)
              </span>
            </div>
            <div className="coverage-bar">
              <div className="coverage-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CostSection() {
  const [window, setWindow] = useState<CostWindow>('24h');
  const { data, loading, error } = useCostData(window);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.hourly_series.map((p) => ({
      label: new Date(p.hour).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
      }),
      usd: Number(p.usd) || 0,
    }));
  }, [data]);

  const modelRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.by_model)
      .map(([k, v]) => ({ key: k, label: shortModelLabel(k), usd: v.usd, calls: v.calls }))
      .sort((a, b) => b.usd - a.usd);
  }, [data]);

  const sourceRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.by_source)
      .map(([k, v]) => ({ key: k, label: shortSourceLabel(k), usd: v.usd, calls: v.calls }))
      .sort((a, b) => b.usd - a.usd);
  }, [data]);

  return (
    <div className="chart-panel">
      <div
        className="chart-panel-title"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>LLM Cost</span>
        <div className="daily-range-presets">
          {(['24h', '7d', '30d'] as CostWindow[]).map((w) => (
            <button
              key={w}
              className={`daily-range-btn${window === w ? ' active' : ''}`}
              onClick={() => setWindow(w)}
            >
              {WINDOW_LABELS[w]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="empty-state" style={{ padding: '16px 0', color: 'var(--danger)' }}>
          Failed to load cost data: {error}
        </div>
      )}

      {loading && !data && <div className="loading-state">Loading cost data...</div>}

      {data && (
        <>
          {/* KPI: total + Top model + Top source */}
          <div className="stat-row" style={{ marginTop: 8, marginBottom: 16 }}>
            <StatCard value={fmtUsd(data.total_usd)} label={`${WINDOW_LABELS[window]} total`} />
            <StatCard
              value={modelRows[0] ? fmtUsd(modelRows[0].usd) : '$0'}
              label={modelRows[0] ? `Top model: ${modelRows[0].label}` : 'No model data'}
            />
            <StatCard
              value={sourceRows[0] ? fmtUsd(sourceRows[0].usd) : '$0'}
              label={sourceRows[0] ? `Top source: ${sourceRows[0].label}` : 'No source data'}
            />
          </div>

          {/* Trend chart */}
          {chartData.length > 0 && (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => fmtUsd(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                  formatter={(v: number) => fmtUsd(v)}
                />
                <Area
                  type="monotone"
                  dataKey="usd"
                  stroke="var(--accent)"
                  fill="var(--accent)"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* By model + By source */}
          <div className="chart-row" style={{ marginTop: 16 }}>
            <div>
              <div className="chart-panel-title" style={{ fontSize: 13, marginBottom: 8 }}>
                By model
              </div>
              <CostBar rows={modelRows} total={data.total_usd} />
            </div>
            <div>
              <div className="chart-panel-title" style={{ fontSize: 13, marginBottom: 8 }}>
                By source
              </div>
              <CostBar rows={sourceRows} total={data.total_usd} />
            </div>
          </div>

          {data.unknown_model_calls > 0 && (
            <div
              className="empty-state"
              style={{
                marginTop: 12,
                padding: '8px 12px',
                color: 'var(--danger)',
                fontSize: 12,
                textAlign: 'left',
              }}
            >
              ⚠️ {data.unknown_model_calls} call{data.unknown_model_calls !== 1 ? 's' : ''} from unsupported models — missing from pricing table (add to orchestrator/lib/molly-pricing.js)
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card with trend                                               */
/* ------------------------------------------------------------------ */

function StatCard({ value, label, trend }: { value: string; label: string; trend?: 'up' | 'down' | 'flat' }) {
  const trendIcon = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2014';
  const trendColor = trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : 'var(--text-muted)';

  return (
    <div className="stat-card">
      <div className="stat-value">
        {value}
        {trend && (
          <span className="stat-trend" style={{ color: trendColor }}>{trendIcon}</span>
        )}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Overview Page                                                      */
/* ------------------------------------------------------------------ */

interface OverviewJob {
  id: string;
  playgroundId: string;
  prdText: string;
  status: string;
  tasks: Array<{ id: string; status: string }>;
  qaStrategy?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Polls /api/job and derives the job-level metrics + recent list the
 * Overview page surfaces. 10s cadence is fine for an at-a-glance view;
 * users who need fresher data click through to /jobs.
 */
function useJobsOverview() {
  const [jobs, setJobs] = useState<OverviewJob[]>([]);
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/job`, {
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setJobs(Array.isArray(data.jobs) ? data.jobs : []);
      } catch {
        /* offline / orchestrator down — leave list as-is */
      }
    };
    void fetchOnce();
    const id = setInterval(fetchOnce, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return useMemo(() => {
    const ACTIVE = new Set([
      'decomposing',
      'planning',
      'delegating',
      'reviewing',
      'qa',
    ]);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const total = jobs.length;
    const active = jobs.filter((j) => ACTIVE.has(j.status)).length;
    const paused = jobs.filter((j) => j.status === 'paused').length;
    const complete = jobs.filter((j) => j.status === 'complete').length;
    const cancelled = jobs.filter((j) => j.status === 'cancelled').length;
    const todays = jobs.filter((j) => j.createdAt >= todayMs).length;
    // Success rate denominator excludes still-active and paused jobs —
    // those haven't reached a terminal verdict yet so counting them
    // would dilute the true rate. cancelled counts toward "not
    // successful" because the user explicitly killed it.
    const completedOrCancelled = complete + cancelled;
    const successRate = completedOrCancelled > 0 ? complete / completedOrCancelled : 0;
    // Avg duration only over completed jobs (the only group with a
    // meaningful "ran to completion" timestamp pair).
    const completed = jobs.filter((j) => j.status === 'complete');
    const avgDurationMs =
      completed.length > 0
        ? completed.reduce((sum, j) => sum + Math.max(0, j.updatedAt - j.createdAt), 0) /
          completed.length
        : null;
    const recent = [...jobs]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8);
    return {
      jobs,
      total,
      active,
      paused,
      todays,
      successRate,
      avgDurationMs,
      recent,
    };
  }, [jobs]);
}

export function OverviewPage() {
  const { summary, records, loading, error } = useAnalyticsDashboardData();
  const { sandboxes, orchestratorUp } = useSandboxStatus();
  const jobsOverview = useJobsOverview();

  const recentRequests = records.slice(0, 10);
  const topRoutes = summary?.topRoutes ?? [];
  const apiUnavailable = !loading && error !== null;

  /* Derived metrics */
  const totalRequests = summary?.totalRequests ?? 0;
  const statusCounts = summary?.statusCounts ?? {};
  const pendingCount = (statusCounts['pending'] ?? 0) + (statusCounts['processing'] ?? 0);
  const previewCount = (statusCounts['preview'] ?? 0) + (statusCounts['completed'] ?? 0) + (statusCounts['approved'] ?? 0);
  const errorCount = statusCounts['error'] ?? 0;
  const denominator = totalRequests - pendingCount;
  const successRate = denominator > 0 ? previewCount / denominator : 0;
  const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;

  /* Today's requests */
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = records.filter(r => {
    if (!r.createdAt) return false;
    return new Date(r.createdAt).getTime() >= todayStart.getTime();
  }).length;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">
          AI agent system health at a glance.
        </p>
      </div>

      {/* Loading / Error states */}
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
          {/* Section 1: Stat Cards (Request-level) */}
          <div className="stat-row">
            <StatCard
              value={formatPercent(successRate)}
              label="Success Rate"
            />
            <StatCard
              value={`${todayCount}`}
              label="Today's Requests"
            />
            <StatCard
              value={formatDuration(summary.averageDurationMs)}
              label="Avg Latency"
            />
            <StatCard
              value={formatPercent(errorRate)}
              label="Error Rate"
            />
          </div>

          {/* Section 1b: Stat Cards (Job-level) — surfaces PRD-driven
              work alongside the raw request stats. Active counts only
              non-terminal statuses; success rate denominator excludes
              still-running jobs to avoid diluting the verdict. */}
          <div className="stat-row">
            <StatCard
              value={`${jobsOverview.active}`}
              label={`Active Jobs${jobsOverview.paused > 0 ? ` (${jobsOverview.paused} paused)` : ''}`}
            />
            <StatCard
              value={`${jobsOverview.todays}`}
              label="Today's Jobs"
            />
            <StatCard
              value={formatPercent(jobsOverview.successRate)}
              label="Job Success Rate"
            />
            <StatCard
              value={
                jobsOverview.avgDurationMs != null
                  ? formatDuration(jobsOverview.avgDurationMs)
                  : '—'
              }
              label="Avg Job Duration"
            />
          </div>

          {/* Section 2: Infrastructure Strip */}
          <div className="infra-strip">
            <span className={`infra-dot ${orchestratorUp === null ? '' : orchestratorUp ? 'up' : 'down'}`} />
            <span>Orchestrator {orchestratorUp === null ? 'Checking' : orchestratorUp ? 'Online' : 'Offline'}</span>
            <span className="infra-sep">&middot;</span>
            <span>{sandboxes.length} Sandbox{sandboxes.length !== 1 ? 'es' : ''}</span>
            <span className="infra-sep">&middot;</span>
            <span>Docker</span>
            <span className="infra-sep">&middot;</span>
            <NavLink
              to="/jobs"
              style={{
                color: jobsOverview.active > 0 ? '#1453b6' : 'inherit',
                fontWeight: jobsOverview.active > 0 ? 600 : 400,
                textDecoration: 'none',
              }}
              title="View progress by job"
            >
              📦 {jobsOverview.active} active job{jobsOverview.active !== 1 ? 's' : ''}
              {jobsOverview.paused > 0 ? ` · ${jobsOverview.paused} paused` : ''}
              {' · '}
              {jobsOverview.total} total →
            </NavLink>
          </div>

          {/* Section 2.5: LLM Cost — surface operating cost */}
          <CostSection />

          {/* Section 3: Daily Trend (full width) */}
          <div className="chart-panel">
            <div className="chart-panel-title">Daily Activity</div>
            <DailyTrendChart records={records} />
          </div>

          {/* Section 4: Agent Performance + Coverage */}
          <div className="chart-row">
            <div className="chart-panel">
              <div className="chart-panel-title">Agent Performance</div>
              <AgentPerformanceChart statusCounts={statusCounts} total={totalRequests} />
            </div>
            <div className="chart-panel">
              <div className="chart-panel-title">Coverage</div>
              <CoverageChart routes={topRoutes} />
            </div>
          </div>

          {/* Section 4: Recent Jobs (PRD-level work units) */}
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Recent Jobs</h2>
              <NavLink className="section-action link" to="/jobs">
                View all &rarr;
              </NavLink>
            </div>

            {jobsOverview.recent.length === 0 && (
              <div className="empty-state">No jobs yet — start one from the Playground or via molly in Slack.</div>
            )}

            {jobsOverview.recent.map((j) => (
              <RecentJobRow key={j.id} job={j} />
            ))}
          </div>

          {/* Section 5: Recent Requests (raw change-request stream) */}
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Recent Requests</h2>
              <NavLink className="section-action link" to="/requests">
                View all &rarr;
              </NavLink>
            </div>

            {recentRequests.length === 0 && !loading && (
              <div className="empty-state">No requests recorded yet.</div>
            )}

            {recentRequests.map((record) => (
              <RequestCard key={record.id} record={record} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

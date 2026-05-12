import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3847';

type Window = '1h' | '24h' | '7d';

interface Bucket {
  t: number;
  ratio: number;
  total: number;
}

interface Metrics {
  ok: boolean;
  window: Window;
  eventCount: number;
  cache: {
    planCalls: number;
    planCacheHits: number;
    planCacheCreates: number;
    hitRatio: number;
    buckets: Bucket[];
  };
  chatLatency: { n: number; p50: number; p95: number; p99: number; mean: number };
  fastPath: { total: number; fastPath: number; missFreq: number };
  lifecycle: { total: number; matched: number; matchRatio: number };
  ambiguous: { total: number; ambiguous: number; ratio: number; buckets: Bucket[] };
  thinking: { prdOn: { n: number; mean: number }; prdOff: { n: number; mean: number } };
  fallback: Record<string, number>;
  plan: { planEmit: number; jobDispatched: number; dispatchRatio: number };
  intakeKinds: Record<string, number>;
}

const REFRESH_MS = 30000;

export function MollyMetricsPage() {
  const [window, setWindow] = useState<Window>('1h');
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async (w: Window) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/molly/metrics?window=${w}`);
      const d: Metrics = await res.json();
      if (!d.ok) throw new Error('failed');
      setData(d);
      setUpdatedAt(Date.now());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(window);
    const id = setInterval(() => void refresh(window), REFRESH_MS);
    return () => clearInterval(id);
  }, [window, refresh]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Molly Metrics</h1>
        <p className="page-subtitle">
          Molly lib call and intake result aggregation. Auto-refreshes every 30s.
        </p>
      </div>

      {/* Window selector */}
      <div className="section">
        <div className="section-header" style={{ alignItems: 'center', gap: 12 }}>
          <h2 className="section-title">Window</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['1h', '24h', '7d'] as Window[]).map((w) => (
              <button
                key={w}
                className={`btn btn-sm ${window === w ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setWindow(w)}
                type="button"
              >
                {w}
              </button>
            ))}
          </div>
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            {updatedAt && (
              <span>
                Last updated {Math.floor((Date.now() - updatedAt) / 1000)}s ago
                · {data?.eventCount ?? 0} events
              </span>
            )}
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => void refresh(window)}
              type="button"
              disabled={loading}
            >
              {loading ? '⟳' : 'Refresh'}
            </button>
            {error && (
              <span style={{ color: 'var(--danger)' }}>⚠️ {error}</span>
            )}
          </div>
        </div>
      </div>

      {!data ? (
        <div className="section">
          <div className="empty-state" style={{ padding: '24px 0' }}>
            Loading…
          </div>
        </div>
      ) : (
        <>
          {/* KPI Row 1 — primary numbers */}
          <div className="stat-row">
            <KpiCard
              label="Cache hit ratio"
              value={`${pct(data.cache.hitRatio)}%`}
              hint={`${data.cache.planCalls} calls`}
              tone={data.cache.hitRatio > 0.5 ? 'success' : undefined}
            />
            <KpiCard
              label="Chat p50"
              value={data.chatLatency.n ? `${data.chatLatency.p50}ms` : '—'}
              hint={`p95 ${data.chatLatency.p95}ms · p99 ${data.chatLatency.p99}ms`}
            />
            <KpiCard
              label="Fast-path hit"
              value={data.fastPath.total ? `${pct(data.fastPath.fastPath / data.fastPath.total)}%` : '—'}
              hint={`${data.fastPath.fastPath} / ${data.fastPath.total} bypassed`}
              tone="accent"
            />
            <KpiCard
              label="Lifecycle match"
              value={data.lifecycle.total ? `${pct(data.lifecycle.matchRatio)}%` : '—'}
              hint={`${data.lifecycle.matched} / ${data.lifecycle.total}`}
            />
            <KpiCard
              label="PRD ambiguous"
              value={data.ambiguous.total ? `${pct(data.ambiguous.ratio)}%` : '—'}
              hint={`${data.ambiguous.ambiguous} / ${data.ambiguous.total}`}
              tone={data.ambiguous.ratio > 0.6 ? 'danger' : undefined}
            />
            <KpiCard
              label="Plan dispatch"
              value={data.plan.planEmit ? `${pct(data.plan.dispatchRatio)}%` : '—'}
              hint={`${data.plan.planEmit} → ${data.plan.jobDispatched}`}
            />
          </div>

          {/* Charts row */}
          <div className="chart-row">
            <ChartCard
              title="Cache hit ratio (plan-emitter)"
              subtitle="DS context 71K token cache efficiency"
            >
              {data.cache.buckets.length > 0 ? (
                <RatioLineChart buckets={data.cache.buckets} color="var(--success)" />
              ) : (
                <ChartEmpty>Appears once plan-emitter calls accumulate</ChartEmpty>
              )}
            </ChartCard>
            <ChartCard
              title="PRD ambiguous ratio"
              subtitle="Ambiguous PRDs / total ratio"
            >
              {data.ambiguous.buckets.length > 0 ? (
                <RatioLineChart buckets={data.ambiguous.buckets} color="var(--accent)" />
              ) : (
                <ChartEmpty>Appears once code_change inputs accumulate</ChartEmpty>
              )}
            </ChartCard>
          </div>

          {/* Bar charts row */}
          <div className="chart-row">
            <ChartCard
              title="Intake kind distribution"
              subtitle="Count of all intake results"
            >
              <CategoryBars categories={data.intakeKinds} />
            </ChartCard>
            <ChartCard
              title="Fallback categories"
              subtitle="Intake error distribution"
            >
              {Object.keys(data.fallback).length === 0 ? (
                <ChartEmpty>No errors ✅</ChartEmpty>
              ) : (
                <CategoryBars categories={data.fallback} color="var(--danger)" />
              )}
            </ChartCard>
          </div>

          {/* Thinking comparison */}
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">PRD thinking ON vs OFF</h2>
              <span style={{ marginLeft: 12, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Latency comparison — same PRD analysis run with thinking on vs. off
              </span>
            </div>
            <div className="stat-row">
              <KpiCard
                label="Thinking ON"
                value={data.thinking.prdOn.n ? `${data.thinking.prdOn.mean}ms` : '—'}
                hint={`${data.thinking.prdOn.n} calls · avg`}
                tone="accent"
              />
              <KpiCard
                label="Thinking OFF"
                value={data.thinking.prdOff.n ? `${data.thinking.prdOff.mean}ms` : '—'}
                hint={`${data.thinking.prdOff.n} calls · avg`}
              />
              <KpiCard
                label="Difference"
                value={
                  data.thinking.prdOn.n && data.thinking.prdOff.n
                    ? `${data.thinking.prdOn.mean - data.thinking.prdOff.mean}ms`
                    : '—'
                }
                hint="ON - OFF (larger value = more thinking overhead)"
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components — Console design tokens                              */
/* ------------------------------------------------------------------ */

function pct(v: number) {
  return Math.round((v || 0) * 100);
}

function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'accent' | 'success' | 'danger';
}) {
  const color =
    tone === 'accent'
      ? 'var(--accent)'
      : tone === 'success'
        ? 'var(--success)'
        : tone === 'danger'
          ? 'var(--danger)'
          : 'var(--text-primary)';
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginTop: 2,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="chart-panel">
      <div className="chart-panel-title">{title}</div>
      {subtitle && (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginTop: -10,
            marginBottom: 12,
          }}
        >
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: 140,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text-primary)',
};

function RatioLineChart({ buckets, color }: { buckets: Bucket[]; color: string }) {
  const data = buckets.map((b) => ({
    label: new Date(b.t).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
    pct: Math.round(b.ratio * 100),
  }));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(label) => `${label}`}
          formatter={(v: number) => [`${v}%`, 'ratio']}
        />
        <Line
          type="monotone"
          dataKey="pct"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 3, fill: color }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CategoryBars({
  categories,
  color = 'var(--accent)',
}: {
  categories: Record<string, number>;
  color?: string;
}) {
  const data = Object.entries(categories).map(([k, v]) => ({ name: k, count: v }));
  if (data.length === 0) return <ChartEmpty>No data</ChartEmpty>;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

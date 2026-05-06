import React, { useCallback, useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Legend,
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
          molly lib 호출 / intake 결과 집계. 자동 새로고침 30s.
        </p>
      </div>

      <div className="section">
        <div className="section-header" style={{ gap: 12, alignItems: 'center' }}>
          <h2 className="section-title">Window</h2>
          <div style={{ display: 'flex', gap: 6, marginLeft: 12 }}>
            {(['1h', '24h', '7d'] as Window[]).map((w) => (
              <button
                key={w}
                className={`btn${window === w ? ' btn-primary' : ''}`}
                onClick={() => setWindow(w)}
              >
                {w}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn" onClick={() => void refresh(window)}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            {updatedAt && (
              <span style={{ opacity: 0.55, fontSize: 12 }}>
                마지막 갱신 {Math.floor((Date.now() - updatedAt) / 1000)}s 전
                · 이벤트 {data?.eventCount ?? 0}건
              </span>
            )}
            {error && <span style={{ color: 'crimson' }}>⚠️ {error}</span>}
          </div>
        </div>
      </div>

      {!data ? (
        <div className="section">
          <div className="settings-section">
            <div className="settings-row">
              <span className="settings-row-label">Loading…</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 16,
          }}
        >
          {/* 1. Cache hit ratio (plan-emitter) */}
          <Card title="🔋 Cache hit ratio (plan-emitter)" subtitle="DS context 71K 토큰 캐시 효율">
            <BigPercent value={data.cache.hitRatio} />
            <Sub>
              {data.cache.planCalls} 호출 · hits {data.cache.planCacheHits} ·
              creates {data.cache.planCacheCreates}
            </Sub>
            {data.cache.buckets.length > 0 && (
              <RatioLineChart buckets={data.cache.buckets} color="#2dd4bf" />
            )}
          </Card>

          {/* 2. Chat latency */}
          <Card title="💬 Chat latency" subtitle="Haiku 회귀 모니터">
            <div style={{ display: 'flex', gap: 24, padding: '8px 0' }}>
              <Stat label="p50" value={`${data.chatLatency.p50}ms`} />
              <Stat label="p95" value={`${data.chatLatency.p95}ms`} />
              <Stat label="p99" value={`${data.chatLatency.p99}ms`} />
              <Stat label="mean" value={`${data.chatLatency.mean}ms`} />
            </div>
            <Sub>{data.chatLatency.n} 호출</Sub>
          </Card>

          {/* 3. Fast-path */}
          <Card title="⚡ Classifier fast-path" subtitle="LLM 우회 비율">
            <BigPercent value={data.fastPath.total ? data.fastPath.fastPath / data.fastPath.total : 0} />
            <Sub>
              {data.fastPath.fastPath} / {data.fastPath.total} 우회 ·
              {' '}LLM 호출 {data.fastPath.total - data.fastPath.fastPath}
            </Sub>
          </Card>

          {/* 4. Lifecycle 정확도 */}
          <Card title="🎯 Lifecycle 잡 매칭" subtitle="잡 ID 식별 성공률">
            <BigPercent value={data.lifecycle.matchRatio} />
            <Sub>
              {data.lifecycle.matched} / {data.lifecycle.total} 매칭
              {data.lifecycle.total === 0 && ' (이벤트 없음)'}
            </Sub>
          </Card>

          {/* 5. PRD ambiguous 비율 */}
          <Card title="🤔 PRD ambiguous 비율" subtitle="명확도 분석">
            <BigPercent value={data.ambiguous.ratio} />
            <Sub>
              {data.ambiguous.ambiguous} / {data.ambiguous.total} 모호
            </Sub>
            {data.ambiguous.buckets.length > 0 && (
              <RatioLineChart buckets={data.ambiguous.buckets} color="#fb923c" />
            )}
          </Card>

          {/* 6. Thinking 효과 */}
          <Card title="🧠 PRD thinking ON vs OFF" subtitle="latency 비교">
            <div style={{ display: 'flex', gap: 24, padding: '8px 0' }}>
              <Stat
                label="ON"
                value={data.thinking.prdOn.n ? `${data.thinking.prdOn.mean}ms` : '—'}
                hint={`${data.thinking.prdOn.n} 호출`}
              />
              <Stat
                label="OFF"
                value={data.thinking.prdOff.n ? `${data.thinking.prdOff.mean}ms` : '—'}
                hint={`${data.thinking.prdOff.n} 호출`}
              />
            </div>
            <Sub>비교 가능한 데이터가 누적되면 효과 측정 가능</Sub>
          </Card>

          {/* 7. Fallback 카테고리 */}
          <Card title="🛡️ Fallback 카테고리" subtitle="intake 에러 분포">
            {Object.keys(data.fallback).length === 0 ? (
              <Sub>에러 없음 ✅</Sub>
            ) : (
              <CategoryBars categories={data.fallback} />
            )}
          </Card>

          {/* 8. Plan dispatch */}
          <Card title="🚀 Plan → Job 진행률" subtitle="plan_emit → job_dispatched">
            <BigPercent value={data.plan.dispatchRatio} />
            <Sub>
              plan_emit {data.plan.planEmit} → dispatched {data.plan.jobDispatched}
            </Sub>
          </Card>

          {/* 9. Intake kinds 분포 */}
          <Card title="📊 Intake kind 분포" subtitle="모든 결과 종류별 카운트">
            <CategoryBars categories={data.intakeKinds} />
          </Card>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="settings-section"
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
      {subtitle && (
        <div style={{ opacity: 0.55, fontSize: 12 }}>{subtitle}</div>
      )}
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

function BigPercent({ value }: { value: number }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace' }}>
      {pct}%
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, opacity: 0.55, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace' }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: 11, opacity: 0.5 }}>{hint}</div>}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{children}</div>
  );
}

function RatioLineChart({ buckets, color }: { buckets: Bucket[]; color: string }) {
  const data = buckets.map((b) => ({
    label: new Date(b.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    pct: Math.round(b.ratio * 100),
  }));
  return (
    <div style={{ width: '100%', height: 100, marginTop: 8 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#444" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'currentColor' }} />
          <YAxis
            tick={{ fontSize: 9, fill: 'currentColor' }}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            width={32}
          />
          <Tooltip
            contentStyle={{ fontSize: 11 }}
            labelFormatter={(label) => `시간 ${label}`}
            formatter={(v: number) => [`${v}%`, 'ratio']}
          />
          <Line type="monotone" dataKey="pct" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CategoryBars({ categories }: { categories: Record<string, number> }) {
  const data = Object.entries(categories).map(([k, v]) => ({ name: k, count: v }));
  if (data.length === 0) return <Sub>데이터 없음</Sub>;
  return (
    <div style={{ width: '100%', height: 140, marginTop: 6 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="#444" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'currentColor' }} />
          <YAxis tick={{ fontSize: 10, fill: 'currentColor' }} width={32} />
          <Tooltip contentStyle={{ fontSize: 11 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="count" fill="#7c3aed" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

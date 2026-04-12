import React, { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3847';

type AnalyticsSummary = {
  totalRequests: number;
  statusCounts: Record<string, number>;
  approvalRate: number;
  noChangeNeededRate: number;
  averageDurationMs: number | null;
  topRoutes: Array<{ route: string; count: number }>;
  topFiles: Array<{ file: string; count: number }>;
  hourlyBuckets: Array<{ hour: string; total: number; approved: number; noChangeNeeded: number; averageDurationMs: number }>;
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

type AnalyticsDetail = {
  request: {
    id: string;
    status: string;
    phase: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    durationMs?: number | null;
    approvalState?: string | null;
    previewUrl?: string | null;
    screenshotUrl?: string | null;
    changedFiles?: string[];
    latestLog?: string | null;
    error?: string | null;
    request?: {
      userPrompt?: string | null;
      pagePath?: string | null;
      client?: string | null;
      language?: string | null;
      requestContract?: {
        change_intent?: string | null;
        goal?: string | null;
      };
    };
    execution?: {
      layer?: string | null;
      productId?: string | null;
      previewAdapterId?: string | null;
      productRunnerId?: string | null;
      repoRoot?: string | null;
      worktreeBase?: string | null;
      worktreePath?: string | null;
      buildPolicyMatched?: boolean;
      testPolicyMatched?: boolean;
    };
  };
  events: Array<{ at: string; type: string; summary?: string; status?: string; phase?: string }>;
};

function formatDuration(ms: number | null | undefined) {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms <= 0) {
    return '\u2014';
  }
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return remain ? `${minutes}m ${remain}s` : `${minutes}m`;
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '\u2014';
  return `${Math.round(value * 100)}%`;
}

function formatRequestedChange(value: string | null | undefined) {
  const text = String(value || '').trim();
  if (!text) return '\uc694\uccad \ud14d\uc2a4\ud2b8 \uc5c6\uc74c';
  return text.length > 96 ? `${text.slice(0, 95)}\u2026` : text;
}

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

      if (!summaryRes.ok) {
        throw new Error(`Analytics summary returned ${summaryRes.status}`);
      }
      if (!recordsRes.ok) {
        throw new Error(`Analytics requests returned ${recordsRes.status}`);
      }

      const summaryJson = await summaryRes.json();
      const recordsJson = await recordsRes.json();

      setSummary(summaryJson.summary ?? null);
      setRecords(recordsJson.records ?? []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Analytics fetch failed');
      setSummary(null);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      await load();
    }

    if (!cancelled) {
      void run();
    }

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

function useAnalyticsRequestDetail(requestId: string | undefined) {
  const [detail, setDetail] = useState<AnalyticsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!requestId) {
      setDetail(null);
      setLoading(false);
      setError('Missing request id');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/analytics/request/${requestId}`);
      if (!response.ok) {
        throw new Error(`Analytics request detail returned ${response.status}`);
      }
      const json = await response.json();
      setDetail(json.detail ?? null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Analytics detail fetch failed');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    let cancelled = false;

    if (!cancelled) {
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [load]);

  return { detail, loading, error, reload: load };
}

function HourlyAnalyticsChart({ buckets }: { buckets: AnalyticsSummary['hourlyBuckets'] }) {
  if (!buckets.length) {
    return <div className="empty-state">아직 시간대별 요청 데이터가 없습니다.</div>;
  }

  const chartBuckets = buckets.slice(-12).map((bucket) => ({
    ...bucket,
    label: new Date(bucket.hour).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div className="hourly-chart-shell">
      <div className="hourly-chart-legend">
        <span><i className="legend-swatch legend-total" /> 요청량</span>
        <span><i className="legend-swatch legend-nochange" /> no-change-needed</span>
        <span><i className="legend-line" /> 평균 처리 시간</span>
      </div>
      <div className="recharts-shell">
        <ResponsiveContainer height={280} width="100%">
          <ComposedChart data={chartBuckets}>
            <CartesianGrid stroke="rgba(215,223,239,0.8)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#5b6579', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="count" tick={{ fill: '#5b6579', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis
              yAxisId="duration"
              orientation="right"
              tick={{ fill: '#c13022', fontSize: 11 }}
              tickFormatter={(value) => `${Math.round(Number(value) / 1000)}s`}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: 14, border: '1px solid #d7dfef', fontSize: 12 }}
              formatter={(value, name) => {
                if (name === '평균 처리 시간') return formatDuration(Number(value));
                return String(value);
              }}
            />
            <Legend />
            <Bar yAxisId="count" dataKey="total" fill="rgba(52, 107, 234, 0.25)" name="요청량" radius={[10, 10, 0, 0]} />
            <Bar yAxisId="count" dataKey="noChangeNeeded" fill="rgba(166, 90, 0, 0.35)" name="no-change-needed" radius={[10, 10, 0, 0]} />
            <Line
              yAxisId="duration"
              type="monotone"
              dataKey="averageDurationMs"
              stroke="#c13022"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#c13022' }}
              name="평균 처리 시간"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AnalyticsTable({ records }: { records: AnalyticsRecord[] }) {
  if (!records.length) {
    return <div className="empty-state">아직 기록된 요청이 없습니다.</div>;
  }

  return (
    <div className="analytics-table">
      <div className="analytics-table-head">
        <span>Request</span>
        <span>Status</span>
        <span>Route</span>
        <span>Duration</span>
        <span>Changed files</span>
      </div>
      {records.map((record) => (
        <div className="analytics-table-row" key={record.id}>
          <span>
            <strong>
              <NavLink className="analytics-detail-link" to={`/ops/requests/${record.id}`}>
                {record.id}
              </NavLink>
            </strong>
            <small>{formatRequestedChange(record.requestedChange)}</small>
          </span>
          <span>
            <strong>{record.status}</strong>
            <small>{record.approvalState || '\u2014'}</small>
          </span>
          <span>
            <strong>{record.client || 'unknown client'}</strong>
            <small>{record.pagePath || '/'}</small>
          </span>
          <span>{formatDuration(record.durationMs)}</span>
          <span>{record.changedFiles?.length ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsOverviewSection() {
  const { summary, records, loading, error, reload } = useAnalyticsDashboardData();

  return (
    <>
      <article className="docs-card span-3 stat analytics-highlight">
        <div className="label">Request volume</div>
        <div className="value">{loading ? '\u2026' : summary?.totalRequests ?? 0}</div>
        <div className="note">Chrome extension과 orchestrator를 거친 전체 요청 수</div>
      </article>
      <article className="docs-card span-3 stat analytics-highlight">
        <div className="label">Approval Rate</div>
        <div className="value">{loading ? '\u2026' : formatPercent(summary?.approvalRate)}</div>
        <div className="note">review까지 간 요청 중 실제 apply로 이어진 비율</div>
      </article>
      <article className="docs-card span-3 stat analytics-highlight">
        <div className="label">Avg. Processing</div>
        <div className="value">{loading ? '\u2026' : formatDuration(summary?.averageDurationMs)}</div>
        <div className="note">요청 접수부터 종료까지의 평균 처리 시간</div>
      </article>
      <article className="docs-card span-3 stat analytics-highlight">
        <div className="label">No change needed</div>
        <div className="value">{loading ? '\u2026' : formatPercent(summary?.noChangeNeededRate)}</div>
        <div className="note">preview 대신 no-change-needed로 끝난 요청 비율</div>
      </article>

      <article className="docs-section-card span-12">
        <div className="docs-section-head">
          <div>
            <h2>Request Analytics</h2>
            <p className="docs-section-copy">
              어떤 요청이 들어왔고, 어디를 수정했고, 승인까지 얼마나 걸렸는지를 운영 관점에서 볼 수 있는 ledger 기반 요약입니다.
            </p>
          </div>
          <button className="analytics-refresh-btn" onClick={reload}>
            새로고침
          </button>
        </div>
        {error ? (
          <div className="analytics-error">
            Analytics API 연결에 실패했습니다: {error}
            <button className="analytics-retry-btn" onClick={reload}>다시 시도</button>
          </div>
        ) : null}
        <div className="analytics-grid">
          <div className="analytics-panel">
            <div className="analytics-panel-title">Top routes</div>
            {loading ? (
              <div className="analytics-loading">불러오는 중…</div>
            ) : (
              <div className="analytics-list">
                {(summary?.topRoutes ?? []).slice(0, 5).map((item) => (
                  <div className="analytics-list-item" key={`${item.route}-${item.count}`}>
                    <span>{item.route}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
                {!summary?.topRoutes?.length ? <div className="empty-state">아직 route 데이터가 없습니다.</div> : null}
              </div>
            )}
          </div>

          <div className="analytics-panel">
            <div className="analytics-panel-title">Top files</div>
            {loading ? (
              <div className="analytics-loading">불러오는 중…</div>
            ) : (
              <div className="analytics-list">
                {(summary?.topFiles ?? []).slice(0, 5).map((item) => (
                  <div className="analytics-list-item analytics-list-item-file" key={`${item.file}-${item.count}`}>
                    <span>{item.file}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
                {!summary?.topFiles?.length ? <div className="empty-state">아직 file 데이터가 없습니다.</div> : null}
              </div>
            )}
          </div>
        </div>
      </article>

      <article className="docs-section-card span-12">
        <div className="docs-section-head">
          <div>
            <h2>Request history</h2>
            <p className="docs-section-copy">
              지금까지 쌓인 요청 이력을 모두 보면서, 어떤 요청이 많이 들어왔고 어디서 자주 수정이 일어났는지 추적할 수 있습니다.
            </p>
          </div>
        </div>
        {loading ? <div className="analytics-loading">요청 이력을 불러오는 중…</div> : <AnalyticsTable records={records} />}
      </article>

      <article className="docs-section-card span-12">
        <div className="docs-section-head">
          <div>
            <h2>Hourly throughput</h2>
            <p className="docs-section-copy">
              최근 12개 시간 버킷 기준으로 요청량, no-change-needed, 평균 처리 시간을 함께 볼 수 있습니다.
            </p>
          </div>
        </div>
        {loading ? <div className="analytics-loading">시간대별 지표를 불러오는 중…</div> : <HourlyAnalyticsChart buckets={summary?.hourlyBuckets ?? []} />}
      </article>
    </>
  );
}

export function AnalyticsDetailSection({ requestId }: { requestId?: string }) {
  const { detail, loading, error, reload } = useAnalyticsRequestDetail(requestId);

  return (
    <section className="docs-grid">
      {loading ? <div className="analytics-loading span-12">요청 상세를 불러오는 중…</div> : null}
      {error ? (
        <div className="analytics-error span-12">
          요청 상세를 불러오지 못했습니다: {error}
          <button className="analytics-retry-btn" onClick={reload}>다시 시도</button>
        </div>
      ) : null}
      {detail ? (
        <>
          <article className="docs-card span-3 stat">
            <div className="label">Status</div>
            <div className="value analytics-status-value">{detail.request.status}</div>
            <div className="note">{detail.request.approvalState || 'pending_review'}</div>
          </article>
          <article className="docs-card span-3 stat">
            <div className="label">Duration</div>
            <div className="value">{formatDuration(detail.request.durationMs)}</div>
            <div className="note">Request created → latest state update</div>
          </article>
          <article className="docs-card span-3 stat">
            <div className="label">Changed files</div>
            <div className="value">{detail.request.changedFiles?.length ?? 0}</div>
            <div className="note">{detail.request.phase}</div>
          </article>
          <article className="docs-card span-3 stat">
            <div className="label">Client / Route</div>
            <div className="value analytics-status-value">{detail.request.request?.client || '\u2014'}</div>
            <div className="note">{detail.request.request?.pagePath || '/'}</div>
          </article>

          <article className="docs-section-card span-6">
            <div className="docs-section-head">
              <div>
                <h2>Request</h2>
                <p className="docs-section-copy">사용자 요청과 실행 계약</p>
              </div>
            </div>
            <div className="analytics-detail-stack">
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">User prompt</div>
                <div className="analytics-detail-copy">{detail.request.request?.userPrompt || '\u2014'}</div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Goal</div>
                <div className="analytics-detail-copy">{detail.request.request?.requestContract?.goal || '\u2014'}</div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Change intent</div>
                <div className="analytics-detail-copy">{detail.request.request?.requestContract?.change_intent || '\u2014'}</div>
              </div>
            </div>
          </article>

          <article className="docs-section-card span-6">
            <div className="docs-section-head">
              <div>
                <h2>Artifacts</h2>
                <p className="docs-section-copy">Preview와 screenshot 링크</p>
              </div>
            </div>
            <div className="analytics-detail-stack">
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Preview URL</div>
                <div className="analytics-detail-copy">
                  {detail.request.previewUrl ? <a href={detail.request.previewUrl}>{detail.request.previewUrl}</a> : '\u2014'}
                </div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Screenshot</div>
                <div className="analytics-detail-copy">
                  {detail.request.screenshotUrl ? <a href={`${API_BASE}${detail.request.screenshotUrl}`}>Open screenshot</a> : '\u2014'}
                </div>
              </div>
              {detail.request.screenshotUrl ? (
                <div className="analytics-detail-block">
                  <div className="analytics-detail-label">Screenshot preview</div>
                  <div className="analytics-screenshot-preview">
                    <img
                      alt={`${detail.request.id} preview screenshot`}
                      src={`${API_BASE}${detail.request.screenshotUrl}`}
                    />
                  </div>
                </div>
              ) : null}
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Latest log</div>
                <div className="analytics-detail-copy">{detail.request.latestLog || '\u2014'}</div>
              </div>
            </div>
          </article>

          <article className="docs-section-card span-12">
            <div className="docs-section-head">
              <div>
                <h2>Execution Layer</h2>
                <p className="docs-section-copy">이 요청이 어떤 product execution 경로와 policy를 탔는지 보여줍니다.</p>
              </div>
            </div>
            <div className="analytics-detail-stack analytics-detail-grid">
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Layer</div>
                <div className="analytics-detail-copy">{detail.request.execution?.layer || '\u2014'}</div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Product</div>
                <div className="analytics-detail-copy">{detail.request.execution?.productId || '\u2014'}</div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Preview adapter</div>
                <div className="analytics-detail-copy">{detail.request.execution?.previewAdapterId || '\u2014'}</div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Product runner</div>
                <div className="analytics-detail-copy">{detail.request.execution?.productRunnerId || '\u2014'}</div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Repo root</div>
                <div className="analytics-detail-copy">{detail.request.execution?.repoRoot || '\u2014'}</div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Worktree base</div>
                <div className="analytics-detail-copy">{detail.request.execution?.worktreeBase || '\u2014'}</div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Worktree path</div>
                <div className="analytics-detail-copy">{detail.request.execution?.worktreePath || '\u2014'}</div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Build policy</div>
                <div className="analytics-detail-copy">{detail.request.execution?.buildPolicyMatched ? 'matched' : 'skipped'}</div>
              </div>
              <div className="analytics-detail-block">
                <div className="analytics-detail-label">Test policy</div>
                <div className="analytics-detail-copy">{detail.request.execution?.testPolicyMatched ? 'matched' : 'skipped'}</div>
              </div>
            </div>
          </article>

          <article className="docs-section-card span-12">
            <div className="docs-section-head">
              <div>
                <h2>Lifecycle</h2>
                <p className="docs-section-copy">이 요청이 어떤 단계를 거쳐 상태가 바뀌었는지 순서대로 볼 수 있습니다.</p>
              </div>
            </div>
            <div className="analytics-timeline">
              {detail.events.map((event, index) => (
                <div className="analytics-timeline-item" key={`${event.at}-${event.type}-${index}`}>
                  <div className="analytics-timeline-time">{new Date(event.at).toLocaleString('ko-KR')}</div>
                  <div className="analytics-timeline-body">
                    <strong>{event.type}</strong>
                    <div>{event.summary || event.phase || event.status || 'state update'}</div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </>
      ) : null}
    </section>
  );
}

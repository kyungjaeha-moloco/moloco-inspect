import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ComponentEntry,
  ComponentsCatalog,
  GovernanceJson,
  ErrorPatternsJson,
  UxCriteriaJson,
} from '../types';
import {
  listGovernanceQueue,
  updateGovernanceStatus,
  type EscalationKind,
  type GovernanceQueueItem,
  type GovernanceStatus,
} from '../services/governance-client';

type Props = {
  data: GovernanceJson;
  errorPatterns: ErrorPatternsJson;
  uxCriteria: UxCriteriaJson;
  catalog: ComponentsCatalog;
};

function QueueSection({ title, items, badgeClass }: { title: string; items: Array<{ name: string; reason?: string; migration?: string }>; badgeClass: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">{title}</h2>
        <span className={`badge ${badgeClass}`}>{items.length}</span>
      </div>
      <div className="queue-list">
        {items.map((item) => (
          <div key={item.name} className="queue-item">
            <span className="queue-item-name">{item.name}</span>
            <span className="queue-item-reason">
              {item.reason}
              {item.migration && <span style={{ display: 'block', marginTop: 2 }}>Migration: {item.migration}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'badge-danger',
  error: 'badge-warning',
  warning: 'badge-info',
};

const CATEGORY_LABEL: Record<string, string> = {
  runtime: 'Runtime',
  build: 'Build',
  styling: 'Styling',
  architecture: 'Architecture',
  i18n: 'i18n',
};

const WEIGHT_BADGE: Record<string, string> = {
  high: 'badge-danger',
  medium: 'badge-warning',
  low: 'badge-info',
};

function ErrorPatternsSection({ data }: { data: ErrorPatternsJson }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const errors = data.errors ?? [];
  const categories = ['all', ...Object.keys(data.categories ?? {})];
  const filtered = activeCategory === 'all' ? errors : errors.filter(e => e.category === activeCategory);

  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">Error Patterns</h2>
        <span className="badge badge-neutral">{errors.length}</span>
      </div>
      <p className="card-desc" style={{ marginBottom: 16 }}>
        {data.meta?.description ?? 'Common errors that occur during development and their fixes.'}
      </p>

      {/* Category filter */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {categories.map(cat => (
          <button
            key={cat}
            className={`tab${activeCategory === cat ? ' active' : ''}`}
            onClick={() => { setActiveCategory(cat); setExpandedId(null); }}
          >
            {cat === 'all' ? 'All' : (CATEGORY_LABEL[cat] ?? cat)}
            {cat === 'all'
              ? <span style={{ opacity: 0.5, marginLeft: 4 }}>{errors.length}</span>
              : <span style={{ opacity: 0.5, marginLeft: 4 }}>{errors.filter(e => e.category === cat).length}</span>
            }
          </button>
        ))}
      </div>

      <div className="pattern-list">
        {filtered.map(err => {
          const isExpanded = expandedId === err.id;
          return (
            <div key={err.id} className={`pattern-card${isExpanded ? ' expanded' : ''}`}>
              <div className="pattern-card-header" onClick={() => setExpandedId(isExpanded ? null : err.id)}>
                <div className="pattern-card-main">
                  <div className="pattern-card-title" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                    {err.error}
                  </div>
                  {err.cause && <div className="pattern-card-desc">{err.cause}</div>}
                </div>
                <div className="pattern-card-meta">
                  <span className={`badge ${SEVERITY_BADGE[err.severity] ?? 'badge-neutral'}`}>{err.severity}</span>
                  <span className="badge badge-neutral">{CATEGORY_LABEL[err.category] ?? err.category}</span>
                </div>
                <div className="pattern-card-chevron">{isExpanded ? '▴' : '▾'}</div>
              </div>

              {isExpanded && (
                <div className="pattern-card-body">
                  {err.detection && (
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>Detection</strong>
                      <div className="card-desc" style={{ marginTop: 4 }}><code className="mono">{err.detection}</code></div>
                    </div>
                  )}

                  {err.common_scenarios && err.common_scenarios.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>Common Scenarios</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                        {err.common_scenarios.map((s, i) => <li key={i} className="card-desc">{s}</li>)}
                      </ul>
                    </div>
                  )}

                  {err.common_mistakes && err.common_mistakes.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>Common Mistakes</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                        {err.common_mistakes.map((m, i) => <li key={i} className="card-desc"><code className="mono">{m}</code></li>)}
                      </ul>
                    </div>
                  )}

                  {err.fix && (
                    <div className="dodont-card dodont-do" style={{ marginBottom: 12 }}>
                      <div className="dodont-card-header">Fix</div>
                      <div className="dodont-card-body card-desc">{err.fix}</div>
                    </div>
                  )}

                  {err.fix_code && (
                    <div style={{ marginBottom: 12 }}>
                      <div className="code-block-header">TSX</div>
                      <div className="code-block">{err.fix_code}</div>
                    </div>
                  )}

                  {err.fix_strategies && err.fix_strategies.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>Fix Strategies</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                        {err.fix_strategies.map((s, i) => <li key={i} className="card-desc">{s}</li>)}
                      </ul>
                    </div>
                  )}

                  {err.affected_components && err.affected_components.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)', display: 'block', marginBottom: 4 }}>Affected Components</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {err.affected_components.map(c => <span key={c} className="badge badge-neutral">{c}</span>)}
                      </div>
                    </div>
                  )}

                  {err.validation_ref && (
                    <div>
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>Validation Ref: </strong>
                      <code className="mono" style={{ fontSize: 'var(--text-xs)' }}>{err.validation_ref}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const UX_CATEGORY_LABELS: Record<string, string> = {
  information_hierarchy: 'Information Hierarchy',
  user_flow: 'User Flow',
  interaction_quality: 'Interaction Quality',
  ux_writing: 'UX Writing',
  accessibility: 'Accessibility',
  completeness: 'Completeness',
};

function UxCriteriaSection({ data }: { data: UxCriteriaJson }) {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categoriesMap = data.criteria ?? {};
  const categoryKeys = Object.keys(categoriesMap);
  const allCriteria = categoryKeys.flatMap(k => categoriesMap[k]);

  const displayedCriteria = activeCategory === 'all'
    ? allCriteria
    : (categoriesMap[activeCategory] ?? []);

  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">UX Criteria</h2>
        <span className="badge badge-neutral">{allCriteria.length}</span>
      </div>
      <p className="card-desc" style={{ marginBottom: 16 }}>
        {data.meta?.description ?? 'UX evaluation criteria for assessing screen quality.'}
      </p>

      {/* Scoring info */}
      {data.scoring && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Scoring Method</div>
          <div className="card-desc">{data.scoring.method}</div>
          {data.scoring.thresholds && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(data.scoring.thresholds).map(([grade, desc]) => (
                <div key={grade} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>
                  <strong style={{ textTransform: 'capitalize' }}>{grade}:</strong> {desc}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category filter */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button
          className={`tab${activeCategory === 'all' ? ' active' : ''}`}
          onClick={() => { setActiveCategory('all'); setExpandedId(null); }}
        >
          All <span style={{ opacity: 0.5, marginLeft: 4 }}>{allCriteria.length}</span>
        </button>
        {categoryKeys.map(k => (
          <button
            key={k}
            className={`tab${activeCategory === k ? ' active' : ''}`}
            onClick={() => { setActiveCategory(k); setExpandedId(null); }}
          >
            {UX_CATEGORY_LABELS[k] ?? k}
            <span style={{ opacity: 0.5, marginLeft: 4 }}>{categoriesMap[k].length}</span>
          </button>
        ))}
      </div>

      {/* Criteria cards */}
      <div className="pattern-list">
        {displayedCriteria.map(criterion => {
          const isExpanded = expandedId === criterion.id;
          return (
            <div key={criterion.id} className={`pattern-card${isExpanded ? ' expanded' : ''}`}>
              <div className="pattern-card-header" onClick={() => setExpandedId(isExpanded ? null : criterion.id)}>
                <div className="pattern-card-main">
                  <div className="pattern-card-title">{criterion.name}</div>
                  <div className="pattern-card-desc" style={{ fontStyle: 'italic' }}>{criterion.question}</div>
                </div>
                <div className="pattern-card-meta">
                  <span className={`badge ${WEIGHT_BADGE[criterion.weight] ?? 'badge-neutral'}`}>{criterion.weight}</span>
                  <span className="badge badge-neutral">{criterion.id}</span>
                </div>
                <div className="pattern-card-chevron">{isExpanded ? '▴' : '▾'}</div>
              </div>

              {isExpanded && (
                <div className="pattern-card-body">
                  {criterion.check_for && criterion.check_for.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)', display: 'block', marginBottom: 6 }}>Check For</strong>
                      <div className="checklist">
                        {criterion.check_for.map((item, i) => (
                          <div key={i} className="checklist-item">
                            <span className="checklist-icon">✓</span>
                            <span className="card-desc">{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="dodont-grid">
                    {criterion.pass && (
                      <div className="dodont-card dodont-do">
                        <div className="dodont-card-header">Pass</div>
                        <div className="dodont-card-body card-desc">{criterion.pass}</div>
                      </div>
                    )}
                    {criterion.fail_example && (
                      <div className="dodont-card dodont-dont">
                        <div className="dodont-card-header">Fail Example</div>
                        <div className="dodont-card-body card-desc">{criterion.fail_example}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// DS Escalation Slice C bootstrap — usage insights derived from
// usage_stats.file_count (Phase 0+ codebase scan). Renders top-N adoption
// bars + an anomaly callout for internal components that claim `stable`
// status but have zero call sites. External-library components (path: null,
// e.g. @moloco/moloco-cloud-react-ui) are filtered out because the scan only
// covers msm-portal-web/src.
function UsageInsightsSection({ catalog }: { catalog: ComponentsCatalog }) {
  const all: ComponentEntry[] = catalog.categories.flatMap((cat) => cat.components);
  const internal = all.filter((c) => !!c.path);
  const ranked = [...all].sort((a, b) => (b.usageFileCount ?? 0) - (a.usageFileCount ?? 0));
  const topN = ranked.slice(0, 15);
  const maxCount = topN[0]?.usageFileCount ?? 0;

  const anomalies = internal.filter(
    (c) => c.status === 'stable' && (c.usageFileCount ?? 0) === 0,
  );
  const totalWithUsage = all.filter((c) => (c.usageFileCount ?? 0) > 0).length;
  const grandTotalFiles = all.reduce((sum, c) => sum + (c.usageFileCount ?? 0), 0);

  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">Usage Insights</h2>
        <span className="badge badge-neutral">{totalWithUsage} / {all.length} in use</span>
      </div>
      <p className="card-desc" style={{ marginBottom: 16 }}>
        Distinct *.tsx/*.ts files in <code className="mono">msm-portal-web/src</code> that
        reference each component, refreshed by{' '}
        <code className="mono">extract-cross-refs.mjs</code>. External-library components
        (<code className="mono">path: null</code>) are excluded from the anomaly check.
      </p>

      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-value">{totalWithUsage}</div>
          <div className="stat-label">Components in use</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{all.length - totalWithUsage}</div>
          <div className="stat-label">Zero-usage entries</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{anomalies.length}</div>
          <div className="stat-label">Stable but zero (anomaly)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{grandTotalFiles.toLocaleString()}</div>
          <div className="stat-label">Total call-site files</div>
        </div>
      </div>

      {anomalies.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--color-warning, #d97706)' }}>
          <div className="card-title">⚠️ Stable but zero-usage (governance review)</div>
          <p className="card-desc" style={{ marginBottom: 8 }}>
            These internal components are catalogued as <code className="mono">stable</code> but
            have no callers in <code className="mono">msm-portal-web</code>. Candidates for
            deprecation or marketing review (docs may be missing).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {anomalies.map((c) => (
              <div
                key={c.name}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)' }}
              >
                <code className="mono">{c.name}</code>
                <span style={{ color: 'var(--text-helper)' }}>{c.shortDescription ?? c.description ?? ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-title" style={{ marginBottom: 8 }}>Top {topN.length} by adoption</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {topN.map((c) => {
          const count = c.usageFileCount ?? 0;
          const width = maxCount > 0 ? Math.max(2, Math.round((count / maxCount) * 100)) : 0;
          const isAnomaly = c.status === 'stable' && count === 0 && !!c.path;
          const isDeprecated = c.status === 'deprecated' || c.status === 'candidate-for-removal';
          const color = isAnomaly
            ? 'var(--color-warning, #d97706)'
            : isDeprecated
              ? 'var(--text-helper, #999)'
              : 'var(--color-accent, #2563eb)';
          return (
            <div
              key={c.name}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(180px, 220px) 1fr 56px',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <code className="mono" style={{ fontSize: 'var(--text-xs)' }}>{c.name}</code>
              <div style={{ background: 'var(--surface-2, #f1f1f1)', borderRadius: 4, overflow: 'hidden', height: 18 }}>
                <div
                  style={{
                    width: `${width}%`,
                    height: '100%',
                    background: color,
                    transition: 'width 0.2s ease-out',
                  }}
                />
              </div>
              <span
                style={{
                  textAlign: 'right',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-helper)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ESCALATION_STATUSES: GovernanceStatus[] = [
  'awaiting_judge',
  'pending',
  'in_review',
  'resolved',
  'dismissed',
];

const ESCALATION_STATUS_LABELS: Record<GovernanceStatus, string> = {
  awaiting_judge: '🤔 Judging…',
  pending: '⏳ Pending',
  in_review: '🔍 In review',
  resolved: '✅ Resolved',
  dismissed: '🚫 Dismissed',
};

const ESCALATION_STATUS_BADGE: Record<GovernanceStatus, string> = {
  awaiting_judge: 'badge-neutral',
  pending: 'badge-warning',
  in_review: 'badge-info',
  resolved: 'badge-success',
  dismissed: 'badge-neutral',
};

const ESCALATION_KIND_LABELS: Record<EscalationKind, string> = {
  propose_new: 'Propose new component',
  extend_existing: 'Extend existing component',
  custom_build: 'Custom (outside DS)',
  unknown: 'Judge pending / unknown',
};

function EscalationQueueSection() {
  const [items, setItems] = useState<GovernanceQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | GovernanceStatus>('pending');
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const filter = statusFilter === 'all' ? undefined : statusFilter;
    listGovernanceQueue({ status: filter, limit: 200 })
      .then((reply) => {
        if (cancelled) return;
        setItems(reply.items ?? []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter, refreshKey]);

  const handleStatusChange = useCallback(
    async (refId: string, next: GovernanceStatus) => {
      setUpdatingId(refId);
      try {
        await updateGovernanceStatus(refId, next, { actor: 'ds_owner' });
        setRefreshKey((k) => k + 1);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setUpdatingId(null);
      }
    },
    [],
  );

  const counts = useMemo(() => {
    const c: Record<GovernanceStatus | 'all', number> = {
      all: items?.length ?? 0,
      awaiting_judge: 0,
      pending: 0,
      in_review: 0,
      resolved: 0,
      dismissed: 0,
    };
    for (const it of items ?? []) {
      c[it.status] = (c[it.status] ?? 0) + 1;
    }
    return c;
  }, [items]);

  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">DS-Missing Escalation Queue</h2>
        <span className="badge badge-info">{counts.all}</span>
      </div>
      <p className="card-desc" style={{ marginBottom: 16 }}>
        Plan-emitter routes unresolved components with similarity &lt; 0.5 here.
        The LLM judge classifies the kind (propose new / extend / custom)
        asynchronously; you act once the row reaches <em>Pending</em>.
      </p>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button
          className={`tab${statusFilter === 'all' ? ' active' : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All <span style={{ opacity: 0.5, marginLeft: 4 }}>{counts.all}</span>
        </button>
        {ESCALATION_STATUSES.map((s) => (
          <button
            key={s}
            className={`tab${statusFilter === s ? ' active' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {ESCALATION_STATUS_LABELS[s]}
            <span style={{ opacity: 0.5, marginLeft: 4 }}>{counts[s] ?? 0}</span>
          </button>
        ))}
        <button
          className="tab"
          onClick={() => setRefreshKey((k) => k + 1)}
          title="Refresh"
          style={{ marginLeft: 'auto' }}
        >
          ↻
        </button>
      </div>

      {error && (
        <div className="empty-state" style={{ marginBottom: 12, color: 'var(--danger, #c00)' }}>
          Could not reach orchestrator: {error}
        </div>
      )}

      {items === null && !error && (
        <div className="empty-state">Loading…</div>
      )}

      {items !== null && items.length === 0 && !error && (
        <div className="empty-state">No items in this view.</div>
      )}

      {items !== null && items.length > 0 && (
        <div className="pattern-list">
          {items.map((it) => {
            const expanded = expandedId === it.id;
            const sim = it.closestMatch?.similarity;
            const simLabel = typeof sim === 'number' ? `${Math.round(sim * 100)}%` : null;
            return (
              <div key={it.id} className={`pattern-card${expanded ? ' expanded' : ''}`}>
                <div
                  className="pattern-card-header"
                  onClick={() => setExpandedId(expanded ? null : it.id)}
                >
                  <div className="pattern-card-main">
                    <div
                      className="pattern-card-title"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
                    >
                      {it.id} — {it.component.intent || '(no intent)'}
                    </div>
                    <div className="pattern-card-desc">
                      {it.closestMatch
                        ? `Closest: ${it.closestMatch.name}${simLabel ? ` (${simLabel} match)` : ''}`
                        : 'No close DS match'}
                    </div>
                  </div>
                  <div className="pattern-card-meta">
                    <span className={`badge ${ESCALATION_STATUS_BADGE[it.status]}`}>
                      {ESCALATION_STATUS_LABELS[it.status]}
                    </span>
                    <span className="badge badge-neutral">
                      {ESCALATION_KIND_LABELS[it.kind] ?? it.kind}
                    </span>
                  </div>
                  <div className="pattern-card-chevron">{expanded ? '▴' : '▾'}</div>
                </div>

                {expanded && (
                  <div className="pattern-card-body">
                    {it.judgeRationale && (
                      <div style={{ marginBottom: 12 }}>
                        <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>
                          Judge rationale
                        </strong>
                        <div className="card-desc" style={{ marginTop: 4 }}>
                          {it.judgeRationale}
                        </div>
                      </div>
                    )}
                    {it.judgeErrorReason && (
                      <div style={{ marginBottom: 12 }}>
                        <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>
                          Judge error
                        </strong>
                        <div className="card-desc" style={{ marginTop: 4, color: 'var(--danger, #c00)' }}>
                          {it.judgeErrorReason}
                        </div>
                      </div>
                    )}
                    {it.component.reason && (
                      <div style={{ marginBottom: 12 }}>
                        <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>
                          Why no DS match
                        </strong>
                        <div className="card-desc" style={{ marginTop: 4 }}>
                          {it.component.reason}
                        </div>
                      </div>
                    )}
                    {it.closestMatch?.reasoning && (
                      <div style={{ marginBottom: 12 }}>
                        <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>
                          Closest-match reasoning
                        </strong>
                        <div className="card-desc" style={{ marginTop: 4 }}>
                          {it.closestMatch.reasoning}
                        </div>
                      </div>
                    )}
                    {it.prdSnippet && (
                      <div style={{ marginBottom: 12 }}>
                        <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>
                          PRD excerpt
                        </strong>
                        <div
                          className="card-desc"
                          style={{
                            marginTop: 4,
                            whiteSpace: 'pre-wrap',
                            maxHeight: 200,
                            overflow: 'auto',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-xs)',
                            background: 'var(--bg-subtle, #f6f6f6)',
                            padding: 8,
                            borderRadius: 4,
                          }}
                        >
                          {it.prdSnippet}
                        </div>
                      </div>
                    )}
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>
                        Context
                      </strong>
                      <div className="card-desc" style={{ marginTop: 4 }}>
                        client={it.context.client ?? '–'} · route={it.context.route ?? '–'} · surface={it.context.surface ?? '–'}
                        {it.context.jobId ? ` · job=${it.context.jobId}` : ''}
                        {it.context.user ? ` · by ${it.context.user}` : ''}
                      </div>
                    </div>

                    {it.status !== 'awaiting_judge' ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {it.status !== 'in_review' && (
                          <button
                            className="tab"
                            disabled={updatingId === it.id}
                            onClick={() => handleStatusChange(it.id, 'in_review')}
                          >
                            🔍 Mark in review
                          </button>
                        )}
                        {it.status !== 'resolved' && (
                          <button
                            className="tab"
                            disabled={updatingId === it.id}
                            onClick={() => handleStatusChange(it.id, 'resolved')}
                          >
                            ✅ Resolve
                          </button>
                        )}
                        {it.status !== 'dismissed' && (
                          <button
                            className="tab"
                            disabled={updatingId === it.id}
                            onClick={() => handleStatusChange(it.id, 'dismissed')}
                          >
                            🚫 Dismiss
                          </button>
                        )}
                        {it.status !== 'pending' && (
                          <button
                            className="tab"
                            disabled={updatingId === it.id}
                            onClick={() => handleStatusChange(it.id, 'pending')}
                          >
                            ↩︎ Reopen
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="card-desc" style={{ fontStyle: 'italic' }}>
                        Judge still running — refresh in a few seconds.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GovernancePage({ data, errorPatterns, uxCriteria, catalog }: Props) {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Governance</h1>
        <p className="page-subtitle">Audit cycles, promotion and deprecation queues, error patterns, and UX quality criteria.</p>
      </div>

      <EscalationQueueSection />

      {data.audit_cycle && (
        <div className="stat-row">
          {data.audit_cycle.last_audit && (
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: '1rem' }}>{data.audit_cycle.last_audit}</div>
              <div className="stat-label">Last Audit</div>
            </div>
          )}
          {data.audit_cycle.next_audit && (
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: '1rem' }}>{data.audit_cycle.next_audit}</div>
              <div className="stat-label">Next Audit</div>
            </div>
          )}
          <div className="stat-card">
            <div className="stat-value">{errorPatterns.errors?.length ?? 0}</div>
            <div className="stat-label">Error Patterns</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {Object.values(uxCriteria.criteria ?? {}).reduce((sum, arr) => sum + arr.length, 0)}
            </div>
            <div className="stat-label">UX Criteria</div>
          </div>
        </div>
      )}

      <QueueSection
        title="Promotion Queue"
        items={data.promotion_queue ?? []}
        badgeClass="badge-success"
      />
      <QueueSection
        title="Deprecation Queue"
        items={data.deprecation_queue ?? []}
        badgeClass="badge-warning"
      />
      <QueueSection
        title="Removal Queue"
        items={data.removal_queue ?? []}
        badgeClass="badge-danger"
      />
      <QueueSection
        title="Watch List"
        items={data.watch_list ?? []}
        badgeClass="badge-info"
      />

      {!data.promotion_queue?.length && !data.deprecation_queue?.length && !data.removal_queue?.length && !data.watch_list?.length && (
        <div className="empty-state" style={{ marginBottom: 32 }}>No governance queue items at this time.</div>
      )}

      <UsageInsightsSection catalog={catalog} />

      <ErrorPatternsSection data={errorPatterns} />

      <UxCriteriaSection data={uxCriteria} />
    </>
  );
}

import React, { useState } from 'react';
import type { GovernanceJson, ErrorPatternsJson, UxCriteriaJson } from '../types';

type Props = {
  data: GovernanceJson;
  errorPatterns: ErrorPatternsJson;
  uxCriteria: UxCriteriaJson;
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

export function GovernancePage({ data, errorPatterns, uxCriteria }: Props) {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Governance</h1>
        <p className="page-subtitle">Audit cycles, promotion and deprecation queues, error patterns, and UX quality criteria.</p>
      </div>

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

      <ErrorPatternsSection data={errorPatterns} />

      <UxCriteriaSection data={uxCriteria} />
    </>
  );
}

import React, { useMemo, useState } from 'react';
import type { PatternLayerEntry, PatternsJson } from '../types';
import { CopyButton } from '../components/CopyButton';

type Props = { data: PatternsJson };

type CategoryId = 'all' | 'page' | 'form' | 'architecture' | 'ui' | 'crosscutting';

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'page', label: 'Page Patterns' },
  { id: 'form', label: 'Form Patterns' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'ui', label: 'UI Patterns' },
  { id: 'crosscutting', label: 'Cross-cutting' },
];

const PATTERN_CATEGORIES: Record<string, CategoryId> = {
  'list-page': 'page',
  'detail-page': 'page',
  'create-page': 'page',
  'edit-page': 'page',
  'form-basic': 'form',
  'form-full-page': 'form',
  'field-layout': 'form',
  'page-container-component': 'architecture',
  'provider-stack': 'architecture',
  'route-registration': 'architecture',
  'trpc-data-fetching': 'architecture',
  'tab-navigation': 'ui',
  'action-button': 'ui',
  'delete-confirm-dialog': 'ui',
  'styled-component': 'ui',
  'error-handling': 'crosscutting',
  'loading-state': 'crosscutting',
  'i18n-usage': 'crosscutting',
  'accessibility': 'crosscutting',
  'navigation': 'crosscutting',
};

const CATEGORY_ICONS: Record<CategoryId, string> = {
  all: '◎',
  page: '📄',
  form: '📝',
  architecture: '🏗',
  ui: '🧩',
  crosscutting: '🔗',
};

function renderLayerValue(v: string | PatternLayerEntry): string {
  if (typeof v === 'string') return v;
  const parts: string[] = [];
  if (v.responsibility) parts.push(v.responsibility);
  return parts.join(' — ') || '—';
}

function renderLayerLocation(v: string | PatternLayerEntry): string | null {
  if (typeof v === 'string') return null;
  return v.location || null;
}

function LayerDiagram({ layers }: { layers: Record<string, string | PatternLayerEntry> }) {
  const entries = Object.entries(layers);
  const hasNesting = entries.length >= 2;

  return (
    <div className="layer-diagram">
      {entries.map(([name, value], i) => {
        const location = renderLayerLocation(value);
        const responsibility = renderLayerValue(value);
        return (
          <div
            key={name}
            className="layer-node"
            style={{ marginLeft: hasNesting ? i * 20 : 0 }}
          >
            <div className="layer-node-header">
              <span className="layer-node-name">{name}</span>
              {location && <span className="layer-node-location">{location}</span>}
            </div>
            <div className="layer-node-desc">{responsibility}</div>
          </div>
        );
      })}
      {hasNesting && (
        <div className="layer-flow-hint">
          {entries.map(([name], i) => (
            <React.Fragment key={name}>
              <span className="layer-flow-step">{name}</span>
              {i < entries.length - 1 && <span className="layer-flow-arrow">→</span>}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export function PatternsPage({ data }: Props) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const patterns = data.patterns ?? [];

  const filtered = useMemo(() => {
    if (activeCategory === 'all') return patterns;
    return patterns.filter(p => PATTERN_CATEGORIES[p.id] === activeCategory);
  }, [patterns, activeCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryId, number> = { all: patterns.length, page: 0, form: 0, architecture: 0, ui: 0, crosscutting: 0 };
    for (const p of patterns) {
      const cat = PATTERN_CATEGORIES[p.id];
      if (cat) counts[cat]++;
    }
    return counts;
  }, [patterns]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Patterns</h1>
        <p className="page-subtitle">
          페이지, 폼, 데이터 페칭 등 MSM Portal의 반복되는 구조를 정리한 조합 패턴입니다.
          각 패턴에는 레이어 구조, 파일 체크리스트, 코드 예시가 포함됩니다.
        </p>
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{patterns.length}</div>
          <div className="stat-label">Total Patterns</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{patterns.filter(p => p.code).length}</div>
          <div className="stat-label">With Code</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{patterns.filter(p => p.layer_structure).length}</div>
          <div className="stat-label">With Layers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{patterns.filter(p => (p.validation_checklist?.length ?? 0) > 0).length}</div>
          <div className="stat-label">With Validation</div>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="tabs">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            className={`tab${activeCategory === cat.id ? ' active' : ''}`}
            onClick={() => { setActiveCategory(cat.id); setExpandedId(null); }}
          >
            {cat.label} <span style={{ opacity: 0.5, marginLeft: 4 }}>{categoryCounts[cat.id]}</span>
          </button>
        ))}
      </div>

      {/* Pattern cards */}
      <div className="pattern-list">
        {filtered.map(pattern => {
          const isExpanded = expandedId === pattern.id;
          const cat = PATTERN_CATEGORIES[pattern.id] || 'crosscutting';
          const fileCount = pattern.file_checklist?.length ?? 0;
          const validCount = pattern.validation_checklist?.length ?? 0;
          const hasCode = !!pattern.code;
          const hasLayers = !!pattern.layer_structure;

          return (
            <div key={pattern.id} className={`pattern-card${isExpanded ? ' expanded' : ''}`}>
              {/* Card header (always visible) */}
              <div
                className="pattern-card-header"
                onClick={() => setExpandedId(isExpanded ? null : pattern.id)}
              >
                <div className="pattern-card-icon">{CATEGORY_ICONS[cat]}</div>
                <div className="pattern-card-main">
                  <div className="pattern-card-title">{pattern.name}</div>
                  <div className="pattern-card-desc">{pattern.description}</div>
                  {pattern.when && (
                    <div className="pattern-card-when">
                      <strong>When:</strong> {pattern.when}
                    </div>
                  )}
                </div>
                <div className="pattern-card-meta">
                  {hasLayers && <span className="badge badge-info">Layers</span>}
                  {hasCode && <span className="badge badge-neutral">Code</span>}
                  {fileCount > 0 && <span className="badge badge-neutral">{fileCount} files</span>}
                  {validCount > 0 && <span className="badge badge-success">{validCount} checks</span>}
                </div>
                <div className="pattern-card-chevron">
                  {isExpanded ? '▴' : '▾'}
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="pattern-card-body">
                  {/* Layer diagram */}
                  {pattern.layer_structure && (
                    <div className="section" style={{ marginBottom: 24 }}>
                      <h3 className="section-title">Layer Structure</h3>
                      <LayerDiagram layers={pattern.layer_structure} />
                    </div>
                  )}

                  {/* File checklist */}
                  {pattern.file_checklist && pattern.file_checklist.length > 0 && (
                    <div className="section" style={{ marginBottom: 24 }}>
                      <h3 className="section-title">File Checklist</h3>
                      <div className="checklist">
                        {pattern.file_checklist.map((item, i) => (
                          <div key={i} className="checklist-item">
                            <span className="checklist-icon">☐</span>
                            <code className="mono">{item}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Validation checklist */}
                  {pattern.validation_checklist && pattern.validation_checklist.length > 0 && (
                    <div className="section" style={{ marginBottom: 24 }}>
                      <h3 className="section-title">Validation Checklist</h3>
                      <div className="checklist">
                        {pattern.validation_checklist.map((item, i) => (
                          <div key={i} className="checklist-item">
                            <span className="checklist-icon">✓</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Code */}
                  {pattern.code && (
                    <div className="section">
                      <h3 className="section-title">Code Example</h3>
                      <div className="code-block-header">{pattern.id}.tsx</div>
                      <div style={{ position: 'relative' }}>
                        <CopyButton text={pattern.code} />
                        <div className="code-block">{pattern.code}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="empty-state">No patterns in this category.</div>
        )}
      </div>
    </>
  );
}

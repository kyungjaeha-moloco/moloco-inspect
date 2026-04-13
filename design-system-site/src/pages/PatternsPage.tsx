import React, { useMemo, useState } from 'react';
import type { PatternLayerEntry, PatternsJson, CodeExamplesJson } from '../types';
import { CopyButton } from '../components/CopyButton';
import { CodeBlock } from '../components/CodeBlock';

type Props = { data: PatternsJson; codeExamples: CodeExamplesJson };

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

export function PatternsPage({ data, codeExamples }: Props) {
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
          Composition patterns for recurring structures in MSM Portal — pages, forms, data fetching, and more.
          Each pattern includes a layer structure, file checklist, and code examples.
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

      {/* Portal Code Examples */}
      {codeExamples.examples && codeExamples.examples.length > 0 && (
        <div className="section" style={{ marginTop: 48 }}>
          <div className="section-header">
            <h2 className="section-title">Portal Code Examples</h2>
          </div>
          <p className="card-desc" style={{ marginBottom: 16 }}>
            {codeExamples.meta?.description ?? 'Real code examples from the MSM Portal codebase for reference and reuse.'}
          </p>
          <div className="pattern-list">
            {codeExamples.examples.map((ex, i) => (
              <PortalCodeExample key={`${ex.pattern}-${ex.entity}-${i}`} example={ex} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function PortalCodeExample({ example }: { example: import('../types').CodeExampleEntry }) {
  const [expanded, setExpanded] = useState(false);
  const snippetEntries = example.key_snippets ? Object.entries(example.key_snippets) : [];

  return (
    <div className={`pattern-card${expanded ? ' expanded' : ''}`}>
      <div className="pattern-card-header" onClick={() => setExpanded(e => !e)}>
        <div className="pattern-card-icon">{'</>'}</div>
        <div className="pattern-card-main">
          <div className="pattern-card-title">
            {example.entity} — {example.pattern.replace(/_/g, ' ')}
          </div>
          <div className="pattern-card-desc">{example.description}</div>
        </div>
        <div className="pattern-card-meta">
          {snippetEntries.length > 0 && (
            <span className="badge badge-neutral">{snippetEntries.length} snippet{snippetEntries.length > 1 ? 's' : ''}</span>
          )}
          {example.key_hooks && example.key_hooks.length > 0 && (
            <span className="badge badge-info">{example.key_hooks.length} hooks</span>
          )}
        </div>
        <div className="pattern-card-chevron">{expanded ? '▴' : '▾'}</div>
      </div>

      {expanded && (
        <div className="pattern-card-body">
          {/* Notes */}
          {example.notes && example.notes.length > 0 && (
            <div className="section" style={{ marginBottom: 16 }}>
              <h3 className="section-title">Notes</h3>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {example.notes.map((note, i) => (
                  <li key={i} className="card-desc" style={{ marginBottom: 4 }}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Key hooks */}
          {example.key_hooks && example.key_hooks.length > 0 && (
            <div className="section" style={{ marginBottom: 16 }}>
              <h3 className="section-title">Key Hooks</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {example.key_hooks.map((hook, i) => (
                  <div key={i} className="checklist-item">
                    <span className="checklist-icon">◆</span>
                    <code className="mono" style={{ fontSize: 'var(--text-xs)' }}>{hook}</code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Code snippets */}
          {snippetEntries.map(([label, code]) => (
            <div key={label} className="section" style={{ marginBottom: 16 }}>
              <h3 className="section-title" style={{ textTransform: 'none', fontSize: 'var(--text-sm)' }}>{label}</h3>
              <div className="code-block-header">TSX</div>
              <CodeBlock code={code} />
            </div>
          ))}

          {/* Key imports */}
          {example.key_imports && example.key_imports.length > 0 && (
            <div className="section">
              <h3 className="section-title">Imports</h3>
              <CodeBlock code={example.key_imports.join('\n')} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

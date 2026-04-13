import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PatternsJson, ComponentsCatalog, PatternLayerEntry } from '../types';
import { CodeBlock } from '../components/CodeBlock';
import { BlockBrowser } from '../components/blocks/BlockBrowser';
import { ListPageBlock } from '../components/blocks/ListPageBlock';
import { DetailPageBlock } from '../components/blocks/DetailPageBlock';
import { CreatePageBlock } from '../components/blocks/CreatePageBlock';
import { EditPageBlock } from '../components/blocks/EditPageBlock';
import { DialogBlock } from '../components/blocks/DialogBlock';
import { slugify } from '../utils';

type Props = {
  patterns: PatternsJson;
  catalog: ComponentsCatalog;
};

type PatternEntry = PatternsJson['patterns'][number];

/* ------------------------------------------------------------------ */
/*  Categories                                                         */
/* ------------------------------------------------------------------ */

const CATEGORY_MAP: Record<string, string> = {
  'list-page': 'Page',
  'detail-page': 'Page',
  'create-page': 'Page',
  'edit-page': 'Page',
  'page-container-component': 'Architecture',
  'form-basic': 'Form',
  'form-full-page': 'Form',
  'field-layout': 'Form',
  'styled-component': 'UI',
  'action-button': 'UI',
  'delete-confirm-dialog': 'UI',
  'tab-navigation': 'UI',
  'loading-state': 'UI',
  'trpc-data-fetching': 'Architecture',
  'provider-stack': 'Architecture',
  'error-handling': 'Architecture',
  'route-registration': 'Architecture',
  'i18n-usage': 'Cross-cutting',
  'accessibility': 'Cross-cutting',
  'navigation': 'Cross-cutting',
};

function getCategory(id: string): string {
  return CATEGORY_MAP[id] ?? 'Other';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractComponentNames(pattern: PatternEntry): string[] {
  const names = new Set<string>();
  if (pattern.code) {
    const matches = pattern.code.match(/\bMC[A-Z][A-Za-z0-9]*/g);
    if (matches) for (const m of matches) names.add(m);
  }
  if (pattern.layer_structure) {
    for (const layer of Object.values(pattern.layer_structure)) {
      if (typeof layer !== 'string' && layer.imports) {
        for (const imp of layer.imports) {
          const mcMatches = imp.match(/\bMC[A-Z][A-Za-z0-9]*/g);
          if (mcMatches) for (const m of mcMatches) names.add(m);
        }
      }
    }
  }
  return Array.from(names).sort();
}

function findComponentSlug(name: string, catalog: ComponentsCatalog): string | null {
  for (const cat of catalog.categories) {
    for (const comp of cat.components) {
      if (comp.name === name) return slugify(comp.name);
    }
  }
  return null;
}

function renderLayerResp(v: string | PatternLayerEntry): string {
  if (typeof v === 'string') return v;
  return v.responsibility ?? '';
}

function renderLayerLoc(v: string | PatternLayerEntry): string | null {
  if (typeof v === 'string') return null;
  return v.location ?? null;
}

/* ------------------------------------------------------------------ */
/*  URL map for block browser chrome                                   */
/* ------------------------------------------------------------------ */

const BLOCK_URL_MAP: Record<string, string> = {
  'list-page': 'https://app.moloco.com/oms/orders',
  'detail-page': 'https://app.moloco.com/oms/orders/ORD-2025-0847',
  'create-page': 'https://app.moloco.com/oms/orders/new',
  'edit-page': 'https://app.moloco.com/oms/orders/ORD-2025-0847/edit',
  'delete-confirm-dialog': 'https://app.moloco.com/oms/orders',
};

/* ------------------------------------------------------------------ */
/*  Full-size block preview components                                 */
/* ------------------------------------------------------------------ */

function FullSizeBlockPreview({ patternId }: { patternId: string }) {
  switch (patternId) {
    case 'list-page':
      return <ListPageBlock />;
    case 'detail-page':
      return <DetailPageBlock />;
    case 'create-page':
      return <CreatePageBlock />;
    case 'edit-page':
      return <EditPageBlock />;
    case 'delete-confirm-dialog':
      return <DialogBlock />;
    default:
      return null;
  }
}

function hasFullSizePreview(id: string): boolean {
  return ['list-page', 'detail-page', 'create-page', 'edit-page', 'delete-confirm-dialog'].includes(id);
}

/* ------------------------------------------------------------------ */
/*  Block card preview — realistic scaled-down page renders            */
/* ------------------------------------------------------------------ */

function MiniListPage() {
  return (
    <div className="block-mini-page">
      <div className="bmp-topbar">
        <div className="bmp-breadcrumb">
          <span className="bmp-breadcrumb-link">Campaigns</span>
          <span>/</span>
          <span>All</span>
        </div>
        <div className="bmp-btn-primary">+ Create Campaign</div>
      </div>
      <div className="bmp-tabs">
        <div className="bmp-tab active">Active</div>
        <div className="bmp-tab">Paused</div>
        <div className="bmp-tab">Archived</div>
      </div>
      <div className="bmp-filter-row">
        <div className="bmp-search">Search campaigns...</div>
        <div className="bmp-filter-btn">Filters</div>
      </div>
      <div className="bmp-table-head">
        <div className="bmp-checkbox" />
        <div>Name</div>
        <div>Status</div>
        <div>Budget</div>
        <div>End Date</div>
        <div />
      </div>
      {[
        { name: 'Summer Sale 2025', status: 'success', statusLabel: 'Active', budget: '$5,000', date: 'Aug 31' },
        { name: 'Brand Awareness Q3', status: 'warning', statusLabel: 'Paused', budget: '$2,400', date: 'Sep 15' },
        { name: 'Retargeting Push', status: 'success', statusLabel: 'Active', budget: '$1,200', date: 'Jul 30' },
        { name: 'Holiday Preview', status: 'neutral', statusLabel: 'Draft', budget: '$8,000', date: 'Dec 01' },
      ].map((row, i) => (
        <div className="bmp-table-row" key={i}>
          <div className="bmp-checkbox" />
          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</div>
          <div>
            <span className={`bmp-badge-${row.status}`}>{row.statusLabel}</span>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>{row.budget}</div>
          <div style={{ color: 'var(--text-helper)' }}>{row.date}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>&#x22EF;</div>
        </div>
      ))}
      <div className="bmp-pagination">
        <span>Showing 1-4 of 24 results</span>
        <div className="bmp-page-btns">
          <div className="bmp-page-btn">&#x2039;</div>
          <div className="bmp-page-btn active">1</div>
          <div className="bmp-page-btn">2</div>
          <div className="bmp-page-btn">3</div>
          <div className="bmp-page-btn">&#x203A;</div>
        </div>
      </div>
    </div>
  );
}

function MiniDetailPage() {
  return (
    <div className="block-mini-page">
      <div className="bmp-topbar">
        <div className="bmp-breadcrumb">
          <span className="bmp-breadcrumb-link">Campaigns</span>
          <span>/</span>
          <span>Summer Sale 2025</span>
        </div>
        <div className="bmp-btn-ghost">Edit</div>
      </div>
      <div className="bmp-title-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="bmp-page-title">Summer Sale 2025</div>
          <span className="bmp-badge-success">Active</span>
        </div>
      </div>
      <div className="bmp-stat-row">
        <div className="bmp-stat-card">
          <div className="bmp-stat-value">$2,500</div>
          <div className="bmp-stat-label">Budget</div>
        </div>
        <div className="bmp-stat-card">
          <div className="bmp-stat-value">12.4K</div>
          <div className="bmp-stat-label">Impressions</div>
        </div>
        <div className="bmp-stat-card">
          <div className="bmp-stat-value">2.3%</div>
          <div className="bmp-stat-label">CTR</div>
        </div>
      </div>
      <div className="bmp-two-col">
        <div className="bmp-panel">
          <div className="bmp-panel-title">Campaign Details</div>
          {[
            ['Advertiser', 'Moloco Inc.'],
            ['Start Date', 'Jul 1, 2025'],
            ['End Date', 'Aug 31, 2025'],
            ['Goal', 'Maximize conversions'],
          ].map(([label, value]) => (
            <div className="bmp-field-row" key={label}>
              <span className="bmp-field-label">{label}</span>
              <span className="bmp-field-value">{value}</span>
            </div>
          ))}
        </div>
        <div className="bmp-panel">
          <div className="bmp-panel-title">Timeline</div>
          {[
            'Campaign launched',
            'Budget updated',
            'Creative approved',
          ].map((entry, i) => (
            <div className="bmp-timeline-item" key={i}>
              <div className="bmp-timeline-dot" />
              <span>{entry}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniCreatePage({ isEdit }: { isEdit?: boolean }) {
  return (
    <div className="block-mini-page">
      <div className="bmp-topbar">
        <div className="bmp-breadcrumb">
          <span className="bmp-breadcrumb-link">Campaigns</span>
          <span>/</span>
          <span>{isEdit ? 'Edit Campaign' : 'Create Campaign'}</span>
        </div>
      </div>
      <div className="bmp-title-row">
        <div className="bmp-page-title">
          {isEdit ? 'Edit: Summer Sale 2025' : 'Create Campaign'}
        </div>
      </div>
      <div className="bmp-form-panel">
        <div className="bmp-form-section-title">Basic Info</div>
        <div className="bmp-field-group">
          <div className="bmp-label">Campaign Name</div>
          <div className={`bmp-input${isEdit ? '' : ' placeholder'}`}>
            {isEdit ? 'Summer Sale 2025' : 'Enter campaign name...'}
          </div>
        </div>
        <div className="bmp-field-group">
          <div className="bmp-label">Campaign Goal</div>
          <div className="bmp-select">
            <span>{isEdit ? 'Maximize conversions' : 'Select a goal...'}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>&#x25BE;</span>
          </div>
        </div>
        <div className="bmp-field-group">
          <div className="bmp-label">Description</div>
          <div className="bmp-textarea">
            {isEdit ? 'Summer sale targeting returning users in Q3...' : 'Optional description...'}
          </div>
        </div>
      </div>
      <div className="bmp-footer">
        <div className="bmp-btn-ghost">Cancel</div>
        <div className="bmp-btn-primary">{isEdit ? 'Save Changes' : 'Create Campaign'}</div>
      </div>
    </div>
  );
}

function MiniDialogPage() {
  return (
    <div className="block-mini-page" style={{ position: 'relative', minHeight: 430, background: 'var(--bg-secondary)' }}>
      {/* blurred background page suggestion */}
      <div style={{ padding: '20px', opacity: 0.3 }}>
        <div className="bmp-topbar" style={{ marginBottom: 8 }}>
          <div className="bmp-breadcrumb"><span>Campaigns</span><span>/</span><span>List</span></div>
        </div>
        <div className="bmp-table-head">
          <div />
          <div>Name</div>
          <div>Status</div>
          <div>Budget</div>
          <div>Date</div>
          <div />
        </div>
        <div className="bmp-table-row">
          <div className="bmp-checkbox" />
          <div>Summer Sale 2025</div>
          <div><span className="bmp-badge-success">Active</span></div>
          <div>$5,000</div>
          <div>Aug 31</div>
          <div>&#x22EF;</div>
        </div>
      </div>
      <div className="bmp-overlay">
        <div className="bmp-dialog-card">
          <div className="bmp-dialog-title">Delete Campaign?</div>
          <div className="bmp-dialog-desc">
            This will permanently delete &ldquo;Summer Sale 2025&rdquo; and all its data. This action cannot be undone.
          </div>
          <div className="bmp-dialog-actions">
            <div className="bmp-btn-ghost">Cancel</div>
            <div className="bmp-btn-danger">Delete</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniTabNavPage() {
  return (
    <div className="block-mini-page">
      <div className="bmp-topbar">
        <div className="bmp-breadcrumb">
          <span className="bmp-breadcrumb-link">Campaigns</span>
          <span>/</span>
          <span>Summer Sale 2025</span>
        </div>
      </div>
      <div className="bmp-title-row">
        <div className="bmp-page-title">Summer Sale 2025</div>
      </div>
      <div className="bmp-tabs">
        <div className="bmp-tab active">Overview</div>
        <div className="bmp-tab">Ad Groups</div>
        <div className="bmp-tab">Creatives</div>
        <div className="bmp-tab">Settings</div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <div className="bmp-stat-row" style={{ padding: 0, marginBottom: 12 }}>
          <div className="bmp-stat-card"><div className="bmp-stat-value">$1,240</div><div className="bmp-stat-label">Spend</div></div>
          <div className="bmp-stat-card"><div className="bmp-stat-value">8.2K</div><div className="bmp-stat-label">Clicks</div></div>
          <div className="bmp-stat-card"><div className="bmp-stat-value">1.8%</div><div className="bmp-stat-label">CTR</div></div>
        </div>
        <div className="bmp-panel">
          <div className="bmp-panel-title">Performance</div>
          <div style={{ height: 60, background: 'var(--accent-light)', borderRadius: 4, display: 'flex', alignItems: 'flex-end', padding: '0 8px', gap: 4 }}>
            {[40, 55, 35, 70, 65, 80, 60].map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${h}%`, background: 'var(--accent)', borderRadius: '2px 2px 0 0', opacity: 0.7 + i * 0.04 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniFormPage() {
  return (
    <div className="block-mini-page">
      <div className="bmp-topbar">
        <div className="bmp-breadcrumb">
          <span className="bmp-breadcrumb-link">Settings</span>
          <span>/</span>
          <span>Account</span>
        </div>
      </div>
      <div className="bmp-title-row">
        <div className="bmp-page-title">Account Settings</div>
      </div>
      <div className="bmp-form-panel">
        <div className="bmp-form-section-title">Profile</div>
        <div className="bmp-field-group">
          <div className="bmp-label">Display Name</div>
          <div className="bmp-input">Moloco User</div>
        </div>
        <div className="bmp-field-group">
          <div className="bmp-label">Email</div>
          <div className="bmp-input">user@moloco.com</div>
        </div>
      </div>
      <div className="bmp-footer">
        <div className="bmp-btn-primary">Save Changes</div>
      </div>
    </div>
  );
}

function MiniArchPage({ name }: { name: string }) {
  const layers = [
    { name: 'Route / Page', desc: 'react-router entry, registers URL' },
    { name: 'Container', desc: 'data fetching, state, side effects' },
    { name: 'View Component', desc: 'pure rendering, receives props' },
    { name: 'Shared DS Component', desc: 'MCButton, MCTable, MCInput...' },
  ];
  return (
    <div className="block-mini-page">
      <div className="bmp-topbar">
        <div className="bmp-breadcrumb">
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
        </div>
      </div>
      <div className="bmp-arch-view">
        {layers.map((layer, i) => (
          <div className="bmp-arch-layer" key={i} style={{ marginLeft: i * 14 }}>
            <div className="bmp-arch-layer-name">{layer.name}</div>
            <div className="bmp-arch-layer-desc">{layer.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockPreview({ pattern }: { pattern: PatternEntry }) {
  const id = pattern.id;

  const inner = (() => {
    if (id === 'list-page') return <MiniListPage />;
    if (id === 'detail-page') return <MiniDetailPage />;
    if (id === 'create-page') return <MiniCreatePage />;
    if (id === 'edit-page') return <MiniCreatePage isEdit />;
    if (id === 'delete-confirm-dialog') return <MiniDialogPage />;
    if (id === 'tab-navigation') return <MiniTabNavPage />;
    if (id === 'form-basic' || id === 'form-full-page' || id === 'field-layout') return <MiniFormPage />;
    return <MiniArchPage name={pattern.name} />;
  })();

  return (
    <div className="block-preview-clip">
      {inner}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Block Card (memoized, like ComponentCard)                          */
/* ------------------------------------------------------------------ */

const BlockCard = React.memo(function BlockCard({
  pattern,
  onClick,
}: {
  pattern: PatternEntry;
  onClick: () => void;
}) {
  const category = getCategory(pattern.id);
  const compCount = extractComponentNames(pattern).length;

  return (
    <div className="card" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{ cursor: 'pointer' }}
    >
      <div style={{ marginBottom: 12, pointerEvents: 'none' }}>
        <BlockPreview pattern={pattern} />
      </div>
      <div className="card-title">{pattern.name}</div>
      <div className="card-desc">{pattern.description}</div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span className="badge badge-neutral">{category}</span>
        {pattern.code && <span className="badge badge-info">Code</span>}
        {compCount > 0 && <span className="badge badge-neutral">{compCount} components</span>}
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Detail view (replaces the grid when a block is selected)           */
/* ------------------------------------------------------------------ */

type ViewMode = 'preview' | 'code' | 'structure';

function BlockDetailView({
  pattern,
  catalog,
  onBack,
}: {
  pattern: PatternEntry;
  catalog: ComponentsCatalog;
  onBack: () => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const componentNames = extractComponentNames(pattern);
  const category = getCategory(pattern.id);
  const hasPreview = hasFullSizePreview(pattern.id);

  // Default to 'structure' if no full-size preview and no code
  const effectiveMode = viewMode === 'preview' && !hasPreview
    ? (pattern.code ? 'code' : 'structure')
    : viewMode;

  return (
    <>
      {/* Breadcrumb */}
      <div className="breadcrumbs">
        <span className="link" onClick={onBack} style={{ cursor: 'pointer' }}>Blocks</span>
        <span>/</span>
        <span>{pattern.name}</span>
      </div>

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">{pattern.name}</h1>
        <p className="page-subtitle">{pattern.description}</p>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <span className="badge badge-neutral">{category}</span>
          {pattern.layer_structure && (
            <span className="badge badge-neutral">{Object.keys(pattern.layer_structure).length} layers</span>
          )}
          {componentNames.length > 0 && (
            <span className="badge badge-info">{componentNames.length} components</span>
          )}
          {pattern.file_checklist && (
            <span className="badge badge-neutral">{pattern.file_checklist.length} files</span>
          )}
        </div>
      </div>

      {/* Toggle bar */}
      <div className="block-toggle-bar">
        {hasPreview && (
          <button
            className={`block-toggle-btn${effectiveMode === 'preview' ? ' active' : ''}`}
            onClick={() => setViewMode('preview')}
          >
            Preview
          </button>
        )}
        {pattern.code && (
          <button
            className={`block-toggle-btn${effectiveMode === 'code' ? ' active' : ''}`}
            onClick={() => setViewMode('code')}
          >
            Code
          </button>
        )}
        <button
          className={`block-toggle-btn${effectiveMode === 'structure' ? ' active' : ''}`}
          onClick={() => setViewMode('structure')}
        >
          Structure
        </button>
      </div>

      {/* Preview tab */}
      {effectiveMode === 'preview' && hasPreview && (
        <BlockBrowser url={BLOCK_URL_MAP[pattern.id] ?? 'https://app.moloco.com'}>
          <FullSizeBlockPreview patternId={pattern.id} />
        </BlockBrowser>
      )}

      {/* Code tab */}
      {effectiveMode === 'code' && pattern.code && (
        <CodeBlock code={pattern.code} lang="tsx" />
      )}

      {/* Structure tab */}
      {effectiveMode === 'structure' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* When to use */}
          {pattern.when && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">When to Use</h2>
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{pattern.when}</p>
            </div>
          )}

          {/* Layer structure */}
          {pattern.layer_structure && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Layer Structure</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(pattern.layer_structure).map(([name, value], i) => {
                  const resp = renderLayerResp(value);
                  const loc = renderLayerLoc(value);
                  return (
                    <div key={name} className="card" style={{ marginLeft: i * 20, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className="badge badge-info" style={{ minWidth: 20, textAlign: 'center' }}>{i + 1}</span>
                        <strong style={{ fontSize: 14 }}>{name}</strong>
                      </div>
                      {resp && <div className="card-desc">{resp}</div>}
                      {loc && <code style={{ fontSize: 11, color: 'var(--text-helper)', display: 'block', marginTop: 4 }}>{loc}</code>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Components used */}
          {componentNames.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Components Used</h2>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {componentNames.map(name => {
                  const slug = findComponentSlug(name, catalog);
                  return slug ? (
                    <Link key={name} to={`/components/${slug}`} className="badge badge-info" style={{ textDecoration: 'none' }}>
                      {name}
                    </Link>
                  ) : (
                    <span key={name} className="badge badge-neutral">{name}</span>
                  );
                })}
              </div>
            </div>
          )}

          {/* File checklist */}
          {pattern.file_checklist && pattern.file_checklist.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">File Checklist</h2>
              </div>
              {pattern.file_checklist.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-helper)' }}>&#9744;</span>
                  <code>{item}</code>
                </div>
              ))}
            </div>
          )}

          {/* Validation checklist */}
          {pattern.validation_checklist && pattern.validation_checklist.length > 0 && (
            <div className="section">
              <div className="section-header">
                <h2 className="section-title">Validation Checklist</h2>
              </div>
              {pattern.validation_checklist.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  <span style={{ color: '#24a148', fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export function BlocksPage({ patterns, catalog }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const allPatterns = useMemo(() =>
    patterns.patterns.map(p => ({ ...p, category: getCategory(p.id) })),
    [patterns],
  );

  const categories = useMemo(() =>
    Array.from(new Set(allPatterns.map(p => p.category))).sort(),
    [allPatterns],
  );

  const filtered = useMemo(() => {
    let result = allPatterns;
    if (categoryFilter) {
      result = result.filter(p => p.category === categoryFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
      );
    }
    return result;
  }, [allPatterns, search, categoryFilter]);

  const selectedPattern = selectedId
    ? patterns.patterns.find(p => p.id === selectedId) ?? null
    : null;

  // Detail view replaces the grid (like ComponentDetailPage)
  if (selectedPattern) {
    return (
      <BlockDetailView
        pattern={selectedPattern}
        catalog={catalog}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  // Grid view (like ComponentsPage)
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Blocks</h1>
        <p className="page-subtitle">
          Browse all {allPatterns.length} composition patterns — from full-page layouts to reusable architecture.
        </p>
      </div>

      <div className="filter-bar">
        <input
          className="search-input"
          placeholder="Search blocks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <div className="card-grid">
        {filtered.map(pattern => (
          <BlockCard
            key={pattern.id}
            pattern={pattern}
            onClick={() => setSelectedId(pattern.id)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">No blocks match your search.</div>
      )}
    </>
  );
}

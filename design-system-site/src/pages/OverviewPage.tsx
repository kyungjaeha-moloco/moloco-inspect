import React from 'react';
import { Link } from 'react-router-dom';
import type { ComponentsCatalog, GovernanceJson } from '../types';

type Props = {
  catalog: ComponentsCatalog;
  depCount: number;
  governanceData: GovernanceJson;
};

/* small helper */
const ProgressBar = ({ value, max, color }: { value: number; max: number; color: string }) => (
  <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, height: 8, width: '100%', overflow: 'hidden' }}>
    <div style={{ background: color, height: '100%', width: `${Math.min((value / max) * 100, 100)}%`, borderRadius: 6, transition: 'width 0.4s' }} />
  </div>
);

export function OverviewPage({ catalog, depCount, governanceData }: Props) {
  const promoCount = governanceData.promotion_queue?.length ?? 0;
  const deprecCount = governanceData.deprecation_queue?.length ?? 0;
  const removalCount = governanceData.removal_queue?.length ?? 0;

  return (
    <>
      {/* ── Hero ── */}
      <div className="page-header">
        <h1 className="page-title">Moloco Design System</h1>
        <p className="page-subtitle">
          A unified component library and design language for building consistent, accessible
          interfaces across the Moloco platform.
        </p>
        <a href="https://github.com/moloco/msm-portal" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 14, color: '#346bea', textDecoration: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          View on GitHub
        </a>
      </div>

      {/* ══════════════════════════════
          Stats (enhanced)
          ══════════════════════════════ */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{catalog.meta.totalComponents}</div>
          <div className="stat-label">Components</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>28 primitives + 62 wrappers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{catalog.meta.totalCategories}</div>
          <div className="stat-label">Categories</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{depCount}</div>
          <div className="stat-label">Dependency Maps</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#346bea' }}>88%</div>
          <div className="stat-label">MCButton2 Migrated</div>
          <div style={{ marginTop: 6 }}><ProgressBar value={88} max={100} color="#346bea" /></div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: '#15803d' }}>3/4</div>
          <div className="stat-label">Deprecations Done</div>
          <div style={{ marginTop: 6 }}><ProgressBar value={3} max={4} color="#15803d" /></div>
        </div>
      </div>

      {/* ══════════════════════════════
          Quick Start
          ══════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Quick Start</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            New here? Pick your task and jump in.
          </p>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { to: '/architecture', icon: '🏗', title: 'Understand the stack', desc: '3-layer architecture, wrapper pattern, theme system' },
            { to: '/components', icon: '🧩', title: 'Choose a component', desc: 'Browse 95 components by category' },
            { to: '/patterns', icon: '📐', title: 'Build a feature', desc: 'Form, list, detail, create page patterns' },
            { to: '/tokens', icon: '🎨', title: 'Style with tokens', desc: 'Colors, typography, spacing — no hardcoded values' },
          ].map(item => (
            <Link key={item.to} to={item.to} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s', height: '100%' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
                <div className="card-title">{item.title}</div>
                <div className="card-desc">{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════
          Layer Overview (compact)
          ══════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Architecture at a Glance</h2>
          <Link to="/architecture" style={{ fontSize: 14, color: '#346bea' }}>Full details &rarr;</Link>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="card" style={{ borderTop: '3px solid #346bea' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#346bea', textTransform: 'uppercase', letterSpacing: 1 }}>Layer 1</div>
            <div className="card-title" style={{ marginTop: 4 }}>Primitives</div>
            <div className="card-desc"><code>@moloco/moloco-cloud-react-ui</code></div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
              Raw UI components. No Formik.
              <br />onChange receives <strong>event</strong>.
            </p>
          </div>
          <div className="card" style={{ borderTop: '3px solid #15803d' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1 }}>Layer 2</div>
            <div className="card-title" style={{ marginTop: 4 }}>Wrappers</div>
            <div className="card-desc"><code>@msm-portal/common/component/*</code></div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
              Formik integration + layout.
              <br />onChange receives <strong>value</strong>.
            </p>
          </div>
          <div className="card" style={{ borderTop: '3px solid #a16207' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#a16207', textTransform: 'uppercase', letterSpacing: 1 }}>Layer 3</div>
            <div className="card-title" style={{ marginTop: 4 }}>App Pages</div>
            <div className="card-desc"><code>apps/tving/</code></div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
              Business logic + page composition.
              <br />Page &rarr; Container &rarr; Component.
            </p>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════
          Brand at a Glance
          ══════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Brand at a Glance</h2>
          <Link to="/tokens" style={{ fontSize: 14, color: '#346bea' }}>All tokens &rarr;</Link>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {/* Color */}
          <div className="card">
            <div className="card-title">Brand Color</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
              <div style={{ width: 48, height: 48, borderRadius: 8, background: '#346bea', flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 600 }}>#346bea</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>BLUE[500] &middot; foundation.assent</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
              {[
                { hex: '#0b1e48', label: '900' },
                { hex: '#122d6b', label: '800' },
                { hex: '#1d4baf', label: '600' },
                { hex: '#346bea', label: '500' },
                { hex: '#5d8bf0', label: '400' },
                { hex: '#a4bef6', label: '200' },
                { hex: '#f8f9fd', label: '50' },
              ].map(c => (
                <div key={c.label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ height: 24, borderRadius: 4, background: c.hex }} />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div className="card">
            <div className="card-title">Typography Scale</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {[
                { name: 'H1', size: '34px', weight: 400 },
                { name: 'H2', size: '28px', weight: 400 },
                { name: 'H3', size: '18px', weight: 500 },
                { name: 'H4', size: '16px', weight: 500 },
                { name: 'Body 1', size: '14px', weight: 400 },
                { name: 'Body 2', size: '12px', weight: 400 },
              ].map(t => (
                <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: parseInt(t.size) > 20 ? 16 : 14, fontWeight: t.weight }}>{t.name}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>{t.size} / {t.weight}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Spacing */}
          <div className="card">
            <div className="card-title">Spacing (8px base)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {[
                { n: 0.5, px: 4, use: 'inline' },
                { n: 1, px: 8, use: 'inline' },
                { n: 1.5, px: 12, use: 'inset' },
                { n: 2, px: 16, use: 'inset' },
                { n: 3, px: 24, use: 'stack' },
                { n: 4, px: 32, use: 'stack' },
                { n: 6, px: 48, use: 'layout' },
              ].map(s => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: '#346bea', height: 8, borderRadius: 2, width: s.px * 1.5, flexShrink: 0, opacity: 0.3 + (s.px / 80) }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 65 }}>spacing({s.n})</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.px}px &middot; {s.use}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════
          Health Dashboard
          ══════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Health</h2>
          <Link to="/governance" style={{ fontSize: 14, color: '#346bea' }}>Governance &rarr;</Link>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Migration progress */}
          <div className="card">
            <div className="card-title">Migration Progress</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span>MCButton &rarr; MCButton2</span>
                  <span style={{ fontWeight: 600 }}>115 / 130 files (88%)</span>
                </div>
                <ProgressBar value={115} max={130} color="#346bea" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span>MCLoader &rarr; MCCircularLoader</span>
                  <span style={{ fontWeight: 600, color: '#15803d' }}>Done</span>
                </div>
                <ProgressBar value={100} max={100} color="#15803d" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span>MCSelect &rarr; MCFormSingleRichSelect</span>
                  <span style={{ fontWeight: 600, color: '#15803d' }}>Done</span>
                </div>
                <ProgressBar value={100} max={100} color="#15803d" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span>MCDatePicker &rarr; MCFormDateRangePicker</span>
                  <span style={{ fontWeight: 600, color: '#15803d' }}>Done</span>
                </div>
                <ProgressBar value={100} max={100} color="#15803d" />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                  <span>MCModal &rarr; MCCommonDialog</span>
                  <span style={{ fontWeight: 600, color: '#a16207' }}>0 / 18 files</span>
                </div>
                <ProgressBar value={0} max={18} color="#a16207" />
              </div>
            </div>
          </div>

          {/* Governance queues */}
          <div className="card">
            <div className="card-title">Governance Queues</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Promotion</span>
                  <span className="badge badge-success">{promoCount} pending</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(governanceData.promotion_queue ?? []).map((c: any) => {
                    const name = typeof c === 'string' ? c : c.component;
                    return <span key={name} className="badge badge-neutral" style={{ fontSize: 12 }}>{name}</span>;
                  })}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Deprecation</span>
                  <span className="badge badge-warning">{deprecCount} pending</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(governanceData.deprecation_queue ?? []).map((c: any) => {
                    const name = typeof c === 'string' ? c : c.component;
                    return <span key={name} className="badge badge-neutral" style={{ fontSize: 12 }}>{name}</span>;
                  })}
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Removal</span>
                  <span className="badge" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>{removalCount} pending</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(governanceData.removal_queue ?? []).map((c: any) => {
                    const name = typeof c === 'string' ? c : c.component;
                    return <span key={name} className="badge badge-neutral" style={{ fontSize: 12 }}>{name}</span>;
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════
          Categories (enhanced)
          ══════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Categories</h2>
          <Link to="/components" style={{ fontSize: 14, color: '#346bea' }}>All components &rarr;</Link>
        </div>
        <div className="card-grid">
          {catalog.categories.map((cat) => (
            <Link key={cat.name} to="/components" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ cursor: 'pointer', height: '100%', transition: 'border-color 0.15s' }}>
                <div className="card-title">{cat.name}</div>
                <div className="card-desc">{cat.description}</div>
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span className="badge badge-info">{cat.count} components</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

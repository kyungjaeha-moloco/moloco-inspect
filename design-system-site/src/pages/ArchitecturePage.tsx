import React from 'react';

/* ─── tiny helpers ─── */
const Do = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0' }}>
    <span style={{ color: '#15803d', fontWeight: 700, fontSize: 16, lineHeight: '22px', flexShrink: 0 }}>DO</span>
    <code style={{ fontSize: 13 }}>{children}</code>
  </div>
);
const Dont = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0' }}>
    <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 16, lineHeight: '22px', flexShrink: 0, textDecoration: 'line-through' }}>DON'T</span>
    <code style={{ fontSize: 13, textDecoration: 'line-through', opacity: 0.6 }}>{children}</code>
  </div>
);

export function ArchitecturePage() {
  return (
    <>
      {/* ── Header ── */}
      <div className="page-header">
        <h1 className="page-title">Architecture</h1>
        <p className="page-subtitle">
          How MSM Portal UI is structured. Read this before writing or reviewing any component code.
        </p>
      </div>

      {/* ══════════════════════════════════════
          SECTION 1 — Three-Layer Stack
          ══════════════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Three-Layer Stack</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            Every UI element lives in exactly one of these layers. Never skip a layer.
          </p>
        </div>

        {/* Layer 1 */}
        <div className="card" style={{ borderLeft: '4px solid #346bea', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="card-title" style={{ margin: 0 }}>Layer 1 &mdash; Primitives</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                <code>@moloco/moloco-cloud-react-ui</code>&nbsp; v0.0.123
              </div>
            </div>
            <span className="badge badge-info">28 component categories</span>
          </div>
          <p style={{ margin: '10px 0 8px', fontSize: 14, color: 'var(--text-secondary)' }}>
            Raw UI building blocks. No Formik. Controlled inputs with <code>(event) =&gt; void</code>.
            Styled via <code>styled-components</code> + theme tokens.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['MCButton2', 'MCSingleTextInput', 'MCSingleTextArea', 'MCSelect', 'MCIcon', 'MCDataTable', 'MCCircularLoader', 'MCDatePicker', 'MCSwitch'].map(c => (
              <span key={c} className="badge" style={{ background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }}>{c}</span>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '6px 0', color: 'var(--text-muted)', fontSize: 18, letterSpacing: 2 }}>
          &darr;&ensp;Formik wrapping + layout standardization&ensp;&darr;
        </div>

        {/* Layer 2 */}
        <div className="card" style={{ borderLeft: '4px solid #15803d', marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="card-title" style={{ margin: 0 }}>Layer 2 &mdash; Portal Wrappers</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                <code>@msm-portal/common/component/*</code>
              </div>
            </div>
            <span className="badge badge-success">62 wrapper components</span>
          </div>
          <p style={{ margin: '10px 0 8px', fontSize: 14, color: 'var(--text-secondary)' }}>
            Wraps Layer 1 with Formik integration, error handling, labels, readonly mode, and layout.
            onChange becomes <code>(value) =&gt; void</code>.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['MCFormTextInput', 'MCFormPanel', 'MCFormLayout', 'MCFormFieldLabel', 'MCFormActions', 'MCFormFieldGroup', 'MCCollapsibleNavbar', 'MCContentLayout'].map(c => (
              <span key={c} className="badge" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>{c}</span>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '6px 0', color: 'var(--text-muted)', fontSize: 18, letterSpacing: 2 }}>
          &darr;&ensp;Business logic + page composition&ensp;&darr;
        </div>

        {/* Layer 3 */}
        <div className="card" style={{ borderLeft: '4px solid #a16207' }}>
          <div>
            <div className="card-title" style={{ margin: 0 }}>Layer 3 &mdash; App Pages</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              <code>apps/tving/</code> &middot; <code>apps/onboard-demo/</code> &middot; <code>apps/msm-default/</code>
            </div>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--text-secondary)' }}>
            Composes Layer 2 components into pages. Follows <strong>Page &rarr; Container &rarr; Component</strong> architecture.
            Data fetching lives in Container, UI in Component.
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════
          SECTION 2 — Wrapper Pattern
          ══════════════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Wrapper Pattern</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            Every <code>MCForm*</code> component follows this exact pattern. Understand it once, apply everywhere.
          </p>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* How it works */}
          <div className="card">
            <div className="card-title">How it works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 14 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ background: '#346bea', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 600 }}>1</span>
                <span><code>useField(name)</code> extracts value, error, touched from Formik</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ background: '#346bea', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 600 }}>2</span>
                <span>Renders Layer 1 primitive inside <code>MCFormField</code> container</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ background: '#346bea', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 600 }}>3</span>
                <span>Adds label (with "(Optional)"), hint, error message automatically</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ background: '#346bea', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 600 }}>4</span>
                <span>Converts onChange from <code>(event)</code> to <code>(value)</code></span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ background: '#346bea', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 600 }}>5</span>
                <span>If <code>readonly</code>, renders <code>MCTextEllipsis</code> instead of input</span>
              </div>
            </div>
          </div>

          {/* What the wrapper adds */}
          <div className="card">
            <div className="card-title">What the wrapper adds</div>
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: 13 }}>
                <tbody>
                  <tr><td style={{ fontWeight: 600 }}>Formik binding</td><td><code>useField(name)</code> auto-manages state</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Error display</td><td>Only after touch (user interaction)</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Label</td><td>Auto "(Optional)" when <code>required=false</code></td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Readonly mode</td><td>Swaps input for <code>MCTextEllipsis</code></td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Width control</td><td>SMALL 40% / MEDIUM 70% / FULL 100%</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Direction</td><td><code>row</code> or <code>column</code> layout</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>fullWidth</td><td>Always <code>true</code> internally</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* DO / DON'T */}
        <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
          <div className="card" style={{ borderTop: '3px solid #15803d' }}>
            <Do>{'<MCFormTextInput name="title" fieldLabel="Title" required />'}</Do>
            <Do>{'onChange={(value: string) => console.log(value)}'}</Do>
            <Do>{'<MCFormSingleRichSelect name="category" />'}</Do>
          </div>
          <div className="card" style={{ borderTop: '3px solid #b91c1c' }}>
            <Dont>{'<MCSingleTextInput value={val} onChange={setVal} />'}</Dont>
            <Dont>{'onChange={(event) => event.target.value}'}</Dont>
            <Dont>{'<MCSelect options={opts} />'}</Dont>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          SECTION 3 — Theme & Providers
          ══════════════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Theme &amp; Providers</h2>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="card">
            <div className="card-title">Accessing tokens</div>
            <pre className="code-block">{`import { getTheme } from '@moloco/moloco-cloud-react-ui';

const SC = styled.div\`
  color: \${p => getTheme(p).palette.content.primary};
  padding: \${p => getTheme(p).spacing(2)};  // 16px
  font-size: \${p => getTheme(p).typography.BODY_1_BODY.size};
\`;`}</pre>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
              <code>getTheme(props)</code> returns <code>theme.mcui</code>.
              Falls back to the default library theme if no ThemeProvider.
            </p>
          </div>
          <div className="card">
            <div className="card-title">Provider stack (order matters)</div>
            <pre className="code-block">{`<ReactQueryProvider>
  <BrowserRouter>
    <I18nextProvider>
      <ThemeProvider theme={createTheme(undefined)}>
        <MCGlobalStyle />
        <MCInAppAlertProvider>
          {children}
        </MCInAppAlertProvider>
      </ThemeProvider>
    </I18nextProvider>
  </BrowserRouter>
</ReactQueryProvider>`}</pre>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
              No custom theme overrides in production.
              All apps pass <code>createTheme(undefined)</code>.
            </p>
          </div>
        </div>

        <h3 style={{ marginTop: 24, marginBottom: 6 }}>Minimum providers for previews</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Components need React context providers to render correctly.
          Use the smallest set that matches your use case.
        </p>
        <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="card" style={{ borderTop: '3px solid #15803d' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: 1 }}>UI only</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 10px' }}>Render a single component without forms or routing.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <code style={{ fontSize: 13 }}>ThemeProvider</code>
              <code style={{ fontSize: 13 }}>MCGlobalStyle</code>
            </div>
          </div>
          <div className="card" style={{ borderTop: '3px solid #346bea' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#346bea', textTransform: 'uppercase', letterSpacing: 1 }}>Form preview</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 10px' }}>Render form inputs with validation and error states.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <code style={{ fontSize: 13 }}>ThemeProvider</code>
              <code style={{ fontSize: 13 }}>MCGlobalStyle</code>
              <code style={{ fontSize: 13 }}>Formik</code>
            </div>
          </div>
          <div className="card" style={{ borderTop: '3px solid #a16207' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#a16207', textTransform: 'uppercase', letterSpacing: 1 }}>Full app</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 10px' }}>Complete app with routing, i18n, data fetching, and alerts.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <code style={{ fontSize: 13 }}>ReactQueryProvider</code>
              <code style={{ fontSize: 13 }}>BrowserRouter</code>
              <code style={{ fontSize: 13 }}>I18nextProvider</code>
              <code style={{ fontSize: 13 }}>ThemeProvider</code>
              <code style={{ fontSize: 13 }}>MCGlobalStyle</code>
              <code style={{ fontSize: 13 }}>MCInAppAlertProvider</code>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          SECTION 4 — Button Migration
          ══════════════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">MCButton &rarr; MCButton2</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            MCButton2 is the current standard. MCButton is legacy.
          </p>
        </div>

        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#15803d' }}>88%</div>
            <div className="stat-label">Migrated (Tving)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">115</div>
            <div className="stat-label">Files use MCButton2</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#b91c1c' }}>15</div>
            <div className="stat-label">Files still on MCButton</div>
          </div>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16 }}>
          <div className="card" style={{ borderTop: '3px solid #15803d' }}>
            <div className="card-title">MCButton2 (use this)</div>
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: 13 }}>
                <tbody>
                  <tr><td>Variant</td><td><code>"basic"</code> | <code>"text"</code></td></tr>
                  <tr><td>Color</td><td><code>"primary"</code> | <code>"secondary"</code> | <code>"tertiary"</code> | <code>"error"</code></td></tr>
                  <tr><td>Loading</td><td><code>loading={'{true}'}</code> &mdash; built-in spinner + auto-disabled</td></tr>
                  <tr><td>Icons</td><td><code>leftIcon="check"</code> &mdash; string icon name supported</td></tr>
                  <tr><td>Styling</td><td>Direct color primitives (predictable)</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="card" style={{ borderTop: '3px solid #b91c1c', opacity: 0.7 }}>
            <div className="card-title"><s>MCButton</s> (legacy)</div>
            <div className="table-wrap">
              <table className="data-table" style={{ fontSize: 13 }}>
                <tbody>
                  <tr><td>Variant</td><td><code>"contained"</code> | <code>"text"</code> | <code>"icon"</code></td></tr>
                  <tr><td>Color</td><td><code>"primary"</code> | <code>"secondary"</code> | <code>"danger"</code> | <code>"default"</code></td></tr>
                  <tr><td>Loading</td><td>Not built-in</td></tr>
                  <tr><td>Icons</td><td>ReactNode only</td></tr>
                  <tr><td>Styling</td><td>Theme indirection via <code>getTheme()</code></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14 }}>
          <strong>Prop mapping cheat-sheet:</strong>&ensp;
          <code>contained</code> &rarr; <code>basic</code>&ensp;&middot;&ensp;
          <code>danger</code> &rarr; <code>error</code>&ensp;&middot;&ensp;
          <code>default</code> &rarr; <code>tertiary</code>&ensp;&middot;&ensp;
          <code>icon</code> variant removed
        </div>
      </div>

      {/* ══════════════════════════════════════
          SECTION 5 — Deprecated Components
          ══════════════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Deprecated Components</h2>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Deprecated</th><th>Replacement</th><th>Tving usage</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><s>MCLoader</s></td><td>MCCircularLoader</td><td>0 files</td>
                <td><span className="badge badge-success">Done</span></td>
              </tr>
              <tr>
                <td><s>MCSelect</s></td><td>MCFormSingleRichSelect</td><td>0 files</td>
                <td><span className="badge badge-success">Done</span></td>
              </tr>
              <tr>
                <td><s>MCDatePicker</s></td><td>MCFormDateRangePicker</td><td>0 files</td>
                <td><span className="badge badge-success">Done</span></td>
              </tr>
              <tr>
                <td><s>MCModal</s></td><td>MCCommonDialog</td><td>18 files</td>
                <td><span className="badge badge-warning">In progress</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
          MCModal usage is concentrated in <code>MCModalFormDialog</code> (shared wrapper).
          Migrating that single file resolves all 18 references.
        </p>
      </div>

      {/* ══════════════════════════════════════
          SECTION 6 — Rules (DO/DON'T)
          ══════════════════════════════════════ */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Rules</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
            Hard rules for agents and developers. Violations will cause runtime errors or broken UI.
          </p>
        </div>

        <div className="card-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="card" style={{ borderTop: '3px solid #15803d' }}>
            <div className="card-title" style={{ color: '#15803d' }}>DO</div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
              <li>Use <strong>Layer 2 wrappers</strong> (<code>MCForm*</code>) in forms</li>
              <li>Use <code>MCButton2</code> with <code>variant="basic"</code></li>
              <li>Use <code>MCCommonDialog</code> for modals</li>
              <li>Use <code>MCCircularLoader</code> for loading states</li>
              <li>Access colors via <code>getTheme(props).palette.*</code></li>
              <li>Access spacing via <code>getTheme(props).spacing(n)</code></li>
              <li>Brand color is <strong>#346bea</strong> (Blue 500)</li>
            </ul>
          </div>
          <div className="card" style={{ borderTop: '3px solid #b91c1c' }}>
            <div className="card-title" style={{ color: '#b91c1c' }}>DON'T</div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8 }}>
              <li>Use <strong>Layer 1 primitives</strong> directly in forms (<code>MCSingleTextInput</code>)</li>
              <li>Use <code>MCButton</code> (legacy) in new code</li>
              <li>Use <code>MCModal</code>, <code>MCLoader</code>, <code>MCSelect</code>, <code>MCDatePicker</code></li>
              <li>Treat onChange as <code>(event)</code> &mdash; wrappers pass <code>(value)</code></li>
              <li>Hardcode hex colors or px spacing</li>
              <li>Customize theme &mdash; <code>createTheme(undefined)</code> everywhere</li>
              <li>Use <code>#6360DC</code> as brand color (it's <code>#346bea</code>)</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

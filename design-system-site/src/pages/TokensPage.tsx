import React, { useMemo, useState } from 'react';
import type { ColorToken, FoundationsData, PaletteSection, TokenValue, TokensJson } from '../types';
import { getContrastText, formatSemantic } from '../utils';
import { CopyButton } from '../components/CopyButton';

type Props = {
  colorsData: FoundationsData;
  tokensData: TokensJson;
};

type TabId = 'semantic-colors' | 'palette' | 'spacing' | 'typography' | 'naming-map';

function isTokenValue(v: unknown): v is TokenValue {
  return typeof v === 'object' && v !== null && 'hex' in v;
}

function tierBadgeClass(tier: string): string {
  switch (tier) {
    case 'core': return 'badge badge-info';
    case 'contextual': return 'badge badge-neutral';
    case 'deprecated': return 'badge badge-danger';
    case 'library_internal': return 'badge badge-warning';
    default: return 'badge badge-neutral';
  }
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'semantic-colors', label: 'Semantic Colors' },
  { id: 'palette', label: 'Color Palette' },
  { id: 'spacing', label: 'Spacing' },
  { id: 'typography', label: 'Typography' },
  { id: 'naming-map', label: 'Naming Map' },
];

const COLOR_SECTIONS = ['text', 'background', 'border', 'icon'] as const;

export function TokensPage({ colorsData, tokensData }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('semantic-colors');
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  // Count all semantic color tokens
  const colorTokenCount = useMemo(() => {
    let count = 0;
    for (const section of COLOR_SECTIONS) {
      const tokens: ColorToken[] = tokensData.color?.[section]?.tokens ?? [];
      count += tokens.length;
      const deprecated: ColorToken[] = tokensData.color?.[section]?.deprecated ?? [];
      count += deprecated.length;
    }
    return count;
  }, [tokensData]);

  const spacingCount = tokensData.spacing?.values?.length ?? 0;
  const typographyCount = tokensData.typography?.tokens?.length ?? 0;
  const borderRadiusCount = tokensData.borderRadius?.tokens?.length ?? 0;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Design Tokens</h1>
        <p className="page-subtitle">
          시멘틱 토큰 시스템. 모든 토큰은 theme.mcui.* 경로로 접근합니다.
        </p>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{colorTokenCount}</div>
          <div className="stat-label">Color Tokens</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{spacingCount}</div>
          <div className="stat-label">Spacing Values</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{typographyCount}</div>
          <div className="stat-label">Typography</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{borderRadiusCount}</div>
          <div className="stat-label">Border Radius</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'semantic-colors' && (
        <SemanticColorsTab tokensData={tokensData} />
      )}
      {activeTab === 'palette' && (
        <PaletteTab data={colorsData} mode={mode} setMode={setMode} />
      )}
      {activeTab === 'spacing' && (
        <SpacingTab tokensData={tokensData} />
      )}
      {activeTab === 'typography' && (
        <TypographyTab tokensData={tokensData} />
      )}
      {activeTab === 'naming-map' && (
        <NamingMapTab tokensData={tokensData} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 1: Semantic Colors — Role-based cards                         */
/* ------------------------------------------------------------------ */

type RoleGroup = {
  role: string;
  tier: string;
  tokens: Record<string, ColorToken>; // property → token
  states: Array<{ name: string; hex: string; token: string }>;
  components: string[];
  usage: string;
};

const ROLE_ORDER = ['neutral', 'brand', 'danger', 'success', 'warning', 'information', 'disabled', 'selected', 'input'];
const ROLE_LABELS: Record<string, string> = {
  neutral: 'Neutral',
  brand: 'Brand',
  danger: 'Danger / Error',
  success: 'Success',
  warning: 'Warning',
  information: 'Information',
  disabled: 'Disabled',
  selected: 'Selected',
  input: 'Input',
};
const ROLE_DESCRIPTIONS: Record<string, string> = {
  neutral: 'Default content, surfaces, and dividers',
  brand: 'Links, primary actions, brand emphasis',
  danger: 'Error messages, destructive actions, validation failures',
  success: 'Success states, positive confirmations',
  warning: 'Caution states, warnings, attention needed',
  information: 'Informational messages, help content',
  disabled: 'Inactive and non-interactive elements',
  selected: 'Selected/highlighted item states',
  input: 'Form input fields and controls',
};
const PROPERTY_LABELS: Record<string, string> = { text: 'Text', background: 'Bg', border: 'Border', icon: 'Icon' };

function buildRoleGroups(tokensData: TokensJson): RoleGroup[] {
  const map = new Map<string, RoleGroup>();

  for (const property of COLOR_SECTIONS) {
    const tokens: ColorToken[] = tokensData.color?.[property]?.tokens ?? [];
    for (const t of tokens) {
      const role = t.role || 'neutral';
      if (!map.has(role)) {
        map.set(role, { role, tier: t.tier, tokens: {}, states: [], components: [], usage: '' });
      }
      const group = map.get(role)!;
      group.tokens[property] = t;
      if (!group.usage && t.usage) group.usage = t.usage;
      if (t.tier === 'core') group.tier = 'core';
      if (t.components) {
        for (const c of t.components) {
          if (!group.components.includes(c)) group.components.push(c);
        }
      }
      if (t.states) {
        for (const [sn, sv] of Object.entries(t.states)) {
          if (!group.states.find(s => s.name === sn)) {
            group.states.push({ name: sn, hex: sv.hex, token: sv.token });
          }
        }
      }
    }
  }

  return ROLE_ORDER.filter(r => map.has(r)).map(r => map.get(r)!);
}

function RolePreview({ group }: { group: RoleGroup }) {
  const bgToken = group.tokens.background;
  const textToken = group.tokens.text;
  const borderToken = group.tokens.border;

  const bg = bgToken?.hex || '#ffffff';
  const text = textToken?.hex || '#161616';
  const border = borderToken?.hex || '#e0e0e0';

  if (group.role === 'brand') {
    return (
      <div className="role-preview">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ padding: '6px 14px', borderRadius: 6, background: bg, color: '#fff', fontSize: 13, fontWeight: 500 }}>
            Create Campaign
          </div>
          <span style={{ color: text, fontSize: 13, fontWeight: 500, textDecoration: 'underline' }}>
            Learn more
          </span>
        </div>
      </div>
    );
  }
  if (group.role === 'danger') {
    return (
      <div className="role-preview">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 14px', background: bg, borderRadius: 6, borderLeft: `3px solid ${border}` }}>
          <span style={{ color: text, fontSize: 13, fontWeight: 500 }}>Validation failed</span>
          <span style={{ color: text, fontSize: 12, opacity: 0.8 }}>Campaign name is required.</span>
        </div>
      </div>
    );
  }
  if (group.role === 'success') {
    return (
      <div className="role-preview">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: bg, borderRadius: 6, borderLeft: `3px solid ${border || text}` }}>
          <span style={{ color: text, fontSize: 14 }}>✓</span>
          <span style={{ color: text, fontSize: 13 }}>Changes saved successfully</span>
        </div>
      </div>
    );
  }
  if (group.role === 'warning') {
    return (
      <div className="role-preview">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: bg, borderRadius: 6 }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          <span style={{ color: '#161616', fontSize: 13 }}>Budget nearly exhausted</span>
        </div>
      </div>
    );
  }
  if (group.role === 'information') {
    return (
      <div className="role-preview">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: bg, borderRadius: 6 }}>
          <span style={{ color: text, fontSize: 14 }}>ℹ</span>
          <span style={{ color: text, fontSize: 13 }}>Processing may take a few minutes</span>
        </div>
      </div>
    );
  }
  // Default: neutral / disabled / selected / input
  return (
    <div className="role-preview">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 14px', background: bg, borderRadius: 6, border: `1px solid ${border}` }}>
        <span style={{ color: text, fontSize: 13 }}>Sample content text</span>
        <span style={{ color: text, fontSize: 12, opacity: 0.6 }}>Secondary description</span>
      </div>
    </div>
  );
}

function SemanticColorsTab({ tokensData }: { tokensData: TokensJson }) {
  const groups = useMemo(() => buildRoleGroups(tokensData), [tokensData]);
  const [showDetail, setShowDetail] = useState<string | null>(null);

  return (
    <>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 24 }}>
        각 Role은 text, background, border, icon 토큰 세트를 포함합니다.
        하나의 Role을 선택하면 그 맥락에 필요한 전체 색상을 알 수 있습니다.
      </p>

      <div className="role-card-grid">
        {groups.map((group) => (
          <div key={group.role} className="role-card">
            {/* Header */}
            <div className="role-card-header">
              <div>
                <div className="role-card-title">
                  {ROLE_LABELS[group.role] || group.role}
                </div>
                <div className="role-card-desc">
                  {ROLE_DESCRIPTIONS[group.role] || group.usage}
                </div>
              </div>
              <span className={tierBadgeClass(group.tier)}>{group.tier}</span>
            </div>

            {/* Swatches row */}
            <div className="role-swatches">
              {COLOR_SECTIONS.map((prop) => {
                const t = group.tokens[prop];
                if (!t) return (
                  <div key={prop} className="role-swatch-item role-swatch-empty">
                    <div className="role-swatch-box" style={{ background: '#f4f4f4', border: '1px dashed #c6c6c6' }} />
                    <div className="role-swatch-label">{PROPERTY_LABELS[prop]}</div>
                    <div className="role-swatch-hex">—</div>
                  </div>
                );
                return (
                  <div key={prop} className="role-swatch-item">
                    <div className="role-swatch-box" style={{ background: t.hex }} title={t.token} />
                    <div className="role-swatch-label">{PROPERTY_LABELS[prop]}</div>
                    <div className="role-swatch-hex">
                      {t.hex}
                      <CopyButton text={t.hex} className="copy-btn-light" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* States */}
            {group.states.length > 0 && (
              <div className="role-states">
                {group.states.map((s) => (
                  <div key={s.name} className="role-state-chip">
                    <span className="role-state-dot" style={{ background: s.hex }} />
                    <span className="role-state-name">{s.name}</span>
                    <span className="role-state-hex">{s.hex}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Preview */}
            <RolePreview group={group} />

            {/* Components */}
            {group.components.length > 0 && (
              <div className="role-components">
                {group.components.slice(0, 6).map((c) => (
                  <span key={c} className="role-component-chip">{c}</span>
                ))}
                {group.components.length > 6 && (
                  <span className="role-component-chip">+{group.components.length - 6}</span>
                )}
              </div>
            )}

            {/* Detail toggle */}
            <button
              className="role-detail-toggle"
              onClick={() => setShowDetail(showDetail === group.role ? null : group.role)}
            >
              {showDetail === group.role ? 'Hide token paths' : 'Show token paths'}
            </button>

            {showDetail === group.role && (
              <div className="role-detail-table">
                {COLOR_SECTIONS.map((prop) => {
                  const t = group.tokens[prop];
                  if (!t) return null;
                  return (
                    <div key={prop} className="role-detail-row">
                      <span className="role-detail-prop">{prop}</span>
                      <code className="mono">{t.token}</code>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 2: Color Palette (from foundations-colors.json)                */
/* ------------------------------------------------------------------ */

function PaletteTab({
  data,
  mode,
  setMode,
}: {
  data: FoundationsData;
  mode: 'light' | 'dark';
  setMode: (m: 'light' | 'dark') => void;
}) {
  const palette = data[mode] ?? {};

  return (
    <>
      <div className="mode-toggle" style={{ marginBottom: 24 }}>
        <button
          className={`mode-toggle-btn${mode === 'light' ? ' active' : ''}`}
          onClick={() => setMode('light')}
        >Light</button>
        <button
          className={`mode-toggle-btn${mode === 'dark' ? ' active' : ''}`}
          onClick={() => setMode('dark')}
        >Dark</button>
      </div>

      {Object.entries(palette).map(([sectionName, section]) => (
        <div key={sectionName} className="section">
          <div className="section-header">
            <h2 className="section-title">{sectionName}</h2>
          </div>
          <table className="token-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>Swatch</th>
                <th>Token</th>
                <th>Hex</th>
                <th>Semantic</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(section as PaletteSection).map(([tokenName, value]) => {
                if (!isTokenValue(value)) return null;
                return (
                  <tr key={tokenName}>
                    <td>
                      <span
                        className="color-swatch"
                        style={{ backgroundColor: value.hex }}
                        title={value.hex}
                      />
                    </td>
                    <td><span className="token-name">{tokenName}</span></td>
                    <td>
                      <span className="token-hex">{value.hex}</span>
                      <CopyButton text={value.hex} className="copy-btn-light" />
                    </td>
                    <td>{formatSemantic(value.semantic)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 3: Spacing                                                    */
/* ------------------------------------------------------------------ */

function SpacingTab({ tokensData }: { tokensData: TokensJson }) {
  const spacing = tokensData.spacing;
  if (!spacing) return <div className="empty-state">No spacing data available.</div>;

  const baseUnit: number = spacing.baseUnit ?? 8;
  const values = spacing.values ?? [];
  const categories = spacing.categories ?? {};

  return (
    <>
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Spacing Scale</h2>
          <span className="badge badge-info">Base unit: {baseUnit}px</span>
        </div>
        <p className="section-subtitle" style={{ marginBottom: 16 }}>
          {spacing.usage ?? `theme.mcui.spacing(n) where n x ${baseUnit}px = value`}
        </p>
        <table className="token-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Value</th>
              <th style={{ width: '40%' }}>Visual</th>
              <th>Usage</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v) => (
              <tr key={v.multiplier}>
                <td>
                  <span className="mono">spacing({v.multiplier})</span>
                  <CopyButton text={`spacing(${v.multiplier})`} className="copy-btn-light" />
                </td>
                <td><span className="mono">{v.px}px</span></td>
                <td>
                  <div
                    className="spacing-bar"
                    style={{ width: Math.min(v.px * 3, 400) }}
                  />
                </td>
                <td>{v.usage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(categories).length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Spacing Categories</h2>
          </div>
          <div className="card-grid">
            {Object.entries(categories).map(([name, cat]) => (
              <div key={name} className="card">
                <div className="card-title">{name}</div>
                <div className="card-desc">
                  <span className="badge badge-neutral" style={{ marginBottom: 4 }}>{cat.range}</span>
                  <br />
                  {cat.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 5: Naming Map — DS name ↔ runtime path                       */
/* ------------------------------------------------------------------ */

type NamingMapRow = {
  dsName: string;
  runtimePath: string;
  hex: string;
  role: string;
  property: string;
};

const PROPERTY_SECTIONS = [
  { key: 'text', label: 'text' },
  { key: 'background', label: 'background' },
  { key: 'border', label: 'border' },
  { key: 'icon', label: 'icon' },
] as const;

const ROLE_OPTIONS = ['all', 'neutral', 'brand', 'danger', 'success', 'warning', 'information', 'disabled', 'selected', 'input'];

function buildNamingMapRows(tokensData: TokensJson): NamingMapRow[] {
  const rows: NamingMapRow[] = [];
  for (const { key, label } of PROPERTY_SECTIONS) {
    const tokens: ColorToken[] = tokensData.color?.[key]?.tokens ?? [];
    for (const t of tokens) {
      rows.push({
        dsName: t.name,
        runtimePath: t.token,
        hex: t.hex,
        role: t.role ?? 'neutral',
        property: label,
      });
    }
  }
  return rows;
}

function NamingMapTab({ tokensData }: { tokensData: TokensJson }) {
  const allRows = useMemo(() => buildNamingMapRows(tokensData), [tokensData]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allRows.filter((row) => {
      const matchesSearch = !q || row.dsName.toLowerCase().includes(q) || row.runtimePath.toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || row.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [allRows, search, roleFilter]);

  return (
    <>
      <div className="naming-map-note">
        <strong>Known naming gap:</strong> The runtime path uses <code>foundation.assent</code> (misspelling of "accent").
        This is a known library issue — do not rename, as it would break all consumers.
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Filter by DS name or runtime path..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: '1px solid var(--border-primary)',
            borderRadius: 4,
            fontSize: 13,
            fontFamily: 'inherit',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
          }}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border-primary)',
            borderRadius: 4,
            fontSize: 13,
            fontFamily: 'inherit',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            minWidth: 140,
          }}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{r === 'all' ? 'All roles' : r}</option>
          ))}
        </select>
      </div>

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">DS Name to Runtime Path</h2>
          <span className="badge badge-neutral">{filtered.length} tokens</span>
        </div>
        <table className="token-table">
          <thead>
            <tr>
              <th>DS Name</th>
              <th>Runtime Path</th>
              <th>Hex</th>
              <th>Role</th>
              <th>Property</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={`${row.property}-${row.dsName}`}>
                <td>
                  <code className="mono" style={{ fontSize: 12 }}>{row.dsName}</code>
                  <CopyButton text={row.dsName} className="copy-btn-light" />
                </td>
                <td>
                  <code className="mono" style={{ fontSize: 12 }}>{row.runtimePath}</code>
                  <CopyButton text={row.runtimePath} className="copy-btn-light" />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className="color-swatch"
                      style={{ backgroundColor: row.hex }}
                      title={row.hex}
                    />
                    <span className="token-hex">{row.hex}</span>
                    <CopyButton text={row.hex} className="copy-btn-light" />
                  </div>
                </td>
                <td><span className="badge badge-neutral">{row.role}</span></td>
                <td><span className="badge badge-info">{row.property}</span></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 0' }}>
                  No tokens match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab 4: Typography                                                 */
/* ------------------------------------------------------------------ */

function TypographyTab({ tokensData }: { tokensData: TokensJson }) {
  const typography = tokensData.typography;
  if (!typography) return <div className="empty-state">No typography data available.</div>;

  const tokens = typography.tokens ?? [];

  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">Typography Scale</h2>
        <span className="badge badge-neutral">{tokens.length} tokens</span>
      </div>
      <p className="section-subtitle" style={{ marginBottom: 16 }}>
        {typography.usage ?? 'theme.mcui.typography.{NAME}.{size|fontWeight|lineHeight}'}
      </p>
      <table className="token-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Weight</th>
            <th>Line Height</th>
            <th>Example</th>
            <th>Usage</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.name}>
              <td>
                <span className="mono">{t.name}</span>
                <CopyButton text={t.name} className="copy-btn-light" />
              </td>
              <td><span className="mono">{t.size}</span></td>
              <td><span className="mono">{t.weight}</span></td>
              <td><span className="mono">{t.lineHeight ?? 'auto'}</span></td>
              <td>
                <span
                  className="type-example"
                  style={{
                    fontSize: t.size,
                    fontWeight: Number(t.weight),
                    lineHeight: t.lineHeight ?? undefined,
                    letterSpacing: t.letterSpacing ?? undefined,
                  }}
                >
                  The quick brown fox
                </span>
              </td>
              <td>{t.usage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import React, { useState } from 'react';
import tokensData from '../../../src/tokens.json';

const tokens = tokensData as any;

// ─── Shared styles ────────────────────────────────────────────────────────────

const S = {
  page: {
    fontFamily: "'DM Sans', sans-serif",
    color: '#111827',
    maxWidth: 1100,
  } as React.CSSProperties,

  pageTitle: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 8,
    color: '#111827',
  } as React.CSSProperties,

  pageSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 40,
    fontFamily: "'DM Sans', sans-serif",
  } as React.CSSProperties,

  section: {
    marginBottom: 40,
    border: '1px solid #E5E7EB',
    borderRadius: 10,
    overflow: 'hidden',
    background: '#fff',
  } as React.CSSProperties,

  sectionHeader: (open: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    cursor: 'pointer',
    userSelect: 'none',
    background: open ? '#F9FAFB' : '#fff',
    borderBottom: open ? '1px solid #E5E7EB' : 'none',
  }),

  sectionTitle: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  } as React.CSSProperties,

  chevron: (open: boolean): React.CSSProperties => ({
    fontSize: 12,
    color: '#6B7280',
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 200ms ease',
  }),

  sectionBody: {
    padding: 20,
  } as React.CSSProperties,

  subsectionLabel: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: '#6B7280',
    marginBottom: 12,
    marginTop: 24,
  },

  code: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    color: '#6B7280',
    background: '#F3F4F6',
    padding: '2px 6px',
    borderRadius: 4,
  } as React.CSSProperties,
};

// ─── Collapsible Section ──────────────────────────────────────────────────────

function Section({ title, badge, children }: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={S.section}>
      <div style={S.sectionHeader(open)} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={S.sectionTitle}>{title}</h2>
          {badge && (
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: '#6B7280',
              background: '#F3F4F6',
              borderRadius: 20,
              padding: '2px 8px',
            }}>{badge}</span>
          )}
        </div>
        <span style={S.chevron(open)}>▼</span>
      </div>
      {open && <div style={S.sectionBody}>{children}</div>}
    </div>
  );
}

// ─── Compact Color Swatch ────────────────────────────────────────────────────

function CompactSwatch({ t, isSelected, onSelect }: {
  t: any;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isTransparent = t.hex === 'transparent';
  const isDark = !isTransparent && isColorDark(t.hex);
  const components: string[] = t.components || [];

  function handleCopyHex(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(t.hex).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div
      onClick={onSelect}
      style={{
        borderRadius: 8,
        overflow: 'hidden',
        border: isSelected ? '2px solid #346bea' : '1px solid #E5E7EB',
        cursor: 'pointer',
        minWidth: 120,
        flex: '1 1 120px',
        maxWidth: 180,
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        boxShadow: isSelected ? '0 0 0 2px #346bea20' : 'none',
      }}
    >
      <div style={{
        height: 48,
        background: isTransparent
          ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 12px 12px'
          : t.hex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        color: copied ? (isDark ? '#fff' : '#111') : 'transparent',
        fontFamily: "'IBM Plex Mono', monospace",
        transition: 'color 150ms',
        position: 'relative',
      }}
        onClick={handleCopyHex}
      >
        {copied ? 'Copied!' : ''}
        {t.state && (
          <span style={{
            position: 'absolute',
            top: 3,
            right: 4,
            fontSize: 7,
            fontWeight: 700,
            textTransform: 'uppercase',
            opacity: 0.7,
            background: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.08)',
            borderRadius: 3,
            padding: '1px 4px',
            color: isDark ? '#fff' : '#111',
          }}>
            {t.state}
          </span>
        )}
      </div>
      <div style={{ padding: '6px 8px', background: isSelected ? '#F8FAFF' : '#fff' }}>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          color: '#111827',
          marginBottom: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {t.name}
        </div>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 9,
          color: '#6B7280',
        }}>
          {t.hex}
        </div>
        {components.length > 0 && (
          <div style={{ marginTop: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {components.slice(0, 2).map((c: string) => (
              <span key={c} style={{
                fontSize: 7,
                fontFamily: "'IBM Plex Mono', monospace",
                color: '#6B7280',
                background: '#F3F4F6',
                borderRadius: 3,
                padding: '1px 3px',
                maxWidth: 70,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                display: 'inline-block',
              }}>
                {c.split(' ')[0]}
              </span>
            ))}
            {components.length > 2 && (
              <span style={{ fontSize: 7, color: '#9CA3AF' }}>+{components.length - 2}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── State Group (connected swatches) ────────────────────────────────────────

function StateGroup({ tokens: stateTokens, selectedToken, onSelect }: {
  tokens: any[];
  selectedToken: string | null;
  onSelect: (name: string) => void;
}) {
  const base = stateTokens.find((t: any) => !t.state) || stateTokens[0];
  const variants = stateTokens.filter((t: any) => t !== base);
  const isGroupSelected = stateTokens.some(t => t.name === selectedToken);

  if (variants.length === 0) {
    return (
      <CompactSwatch
        t={base}
        isSelected={selectedToken === base.name}
        onSelect={() => onSelect(base.name)}
      />
    );
  }

  return (
    <div style={{
      border: isGroupSelected ? '2px solid #346bea' : '1px solid #E5E7EB',
      borderRadius: 8,
      overflow: 'hidden',
      flex: '1 1 150px',
      maxWidth: 200,
      minWidth: 150,
      boxShadow: isGroupSelected ? '0 0 0 2px #346bea20' : 'none',
      transition: 'all 150ms ease',
    }}>
      {/* Color scale bar */}
      <div style={{ display: 'flex', height: 32 }}>
        {[base, ...variants].map((t: any) => (
          <div
            key={t.name}
            onClick={() => onSelect(t.name)}
            style={{
              flex: 1,
              cursor: 'pointer',
              background: t.hex === 'transparent'
                ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 6px 6px'
                : t.hex,
              outline: selectedToken === t.name ? '2px solid #111827' : 'none',
              outlineOffset: -2,
              position: 'relative',
            }}
          >
            {t.state && (
              <span style={{
                position: 'absolute',
                bottom: 2,
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: 6,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: isColorDark(t.hex) ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.4)',
              }}>
                {t.state.slice(0, 3)}
              </span>
            )}
          </div>
        ))}
      </div>
      {/* Label */}
      <div style={{ padding: '5px 8px', background: '#fff' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {base.name.replace(/\.default$/, '')}
        </div>
        <div style={{ fontSize: 8, color: '#9CA3AF' }}>
          {stateTokens.length} states
        </div>
      </div>
    </div>
  );
}

// ─── Token Detail Panel (bottom) ─────────────────────────────────────────────

function TokenDetailPanel({ token, allTokens, onClose, onSelectSibling }: {
  token: any;
  allTokens: any[];
  onClose: () => void;
  onSelectSibling: (name: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const components: string[] = token.components || [];
  const isTransparent = token.hex === 'transparent';

  // Find sibling state tokens
  const baseName = token.name.replace(/\.(default|hovered|pressed|focused|disabled|error)$/, '');
  const siblings = allTokens.filter(t =>
    t.name.replace(/\.(default|hovered|pressed|focused|disabled|error)$/, '') === baseName
  );

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1200);
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.25)',
          zIndex: 999,
          backdropFilter: 'blur(2px)',
        }}
      />
      {/* Dialog */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
        width: 640,
        maxWidth: 'calc(100vw - 48px)',
        maxHeight: 'calc(100vh - 48px)',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '16px 20px',
          borderBottom: '1px solid #E5E7EB',
        }}>
          {/* Large color preview */}
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 10,
            background: isTransparent
              ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 8px 8px'
              : token.hex,
            border: '1px solid rgba(0,0,0,0.08)',
            flexShrink: 0,
          }} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#111827',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              {token.name}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
              <span
                onClick={() => copyText(token.hex, 'hex')}
                style={{ ...S.code, fontSize: 12, cursor: 'pointer' }}
              >
                {copied === 'hex' ? 'Copied!' : token.hex}
              </span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>{token.usage}</span>
            </div>
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid #E5E7EB',
              background: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              color: '#6B7280',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* State siblings bar */}
        {siblings.length > 1 && (
          <div style={{
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid #E5E7EB',
          }}>
            {siblings.map((s: any) => {
              const isActive = s.name === token.name;
              const dark = s.hex !== 'transparent' && isColorDark(s.hex);
              return (
                <div
                  key={s.name}
                  onClick={() => onSelectSibling(s.name)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    cursor: 'pointer',
                    background: isActive ? '#F8FAFF' : '#fff',
                    borderBottom: isActive ? '2px solid #346bea' : '2px solid transparent',
                    textAlign: 'center',
                    transition: 'all 100ms ease',
                  }}
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: s.hex === 'transparent'
                      ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 6px 6px'
                      : s.hex,
                    border: isActive ? '2px solid #346bea' : '1px solid rgba(0,0,0,0.08)',
                    margin: '0 auto 4px',
                  }} />
                  <div style={{ fontSize: 9, fontWeight: 600, color: isActive ? '#346bea' : '#9CA3AF', textTransform: 'uppercase' }}>
                    {s.state || 'default'}
                  </div>
                  <div style={{
                    fontSize: 9,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: '#9CA3AF',
                  }}>
                    {s.hex}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '16px 20px' }}>
          {/* Token Path */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
              Token Path
            </div>
            <span
              onClick={() => copyText(token.token, 'token')}
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                color: '#1D4ED8',
                background: '#EFF6FF',
                padding: '5px 10px',
                borderRadius: 5,
                cursor: 'pointer',
                display: 'inline-block',
                border: '1px solid #BFDBFE',
              }}
            >
              {copied === 'token' ? 'Copied!' : token.token}
            </span>
          </div>

          {/* Description */}
          {token.$description && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                Description
              </div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                {token.$description}
              </div>
            </div>
          )}

          {/* Do not use for */}
          {token.do_not_use_for && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
                Do NOT use for
              </div>
              <div style={{
                fontSize: 12,
                color: '#991B1B',
                lineHeight: 1.5,
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 8,
                padding: '10px 12px',
              }}>
                {token.do_not_use_for}
              </div>
            </div>
          )}

          {/* Components */}
          {components.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Used by {components.length} components
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {components.map((c: string) => (
                  <span key={c} style={{
                    fontSize: 11,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: '#1D4ED8',
                    background: '#EFF6FF',
                    border: '1px solid #BFDBFE',
                    borderRadius: 5,
                    padding: '3px 8px',
                  }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function isColorDark(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length < 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Perceived luminance
  return (r * 0.299 + g * 0.587 + b * 0.114) < 140;
}

// ─── Semantic Colors Section ──────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  neutral: { label: 'Neutral', color: '#374151', bg: '#F9FAFB', border: '#E5E7EB' },
  brand:   { label: 'Brand',   color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  danger:  { label: 'Danger',  color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  success: { label: 'Success', color: '#15803D', bg: '#F0FDF4', border: '#BBF7D0' },
  warning: { label: 'Warning', color: '#A16207', bg: '#FFFBEB', border: '#FDE68A' },
  information: { label: 'Information', color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
  disabled: { label: 'Disabled', color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
  selected: { label: 'Selected', color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  input:   { label: 'Input',   color: '#374151', bg: '#F9FAFB', border: '#E5E7EB' },
};

const PROPERTY_META: Record<string, { icon: string; label: string }> = {
  text:       { icon: 'Aa', label: 'Text' },
  background: { icon: '◻', label: 'Background' },
  border:     { icon: '▢', label: 'Border' },
  icon:       { icon: '◆', label: 'Icon' },
};

function groupTokensByRole(allTokens: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {};
  for (const t of allTokens) {
    const role = t.role || 'neutral';
    if (!groups[role]) groups[role] = [];
    groups[role].push(t);
  }
  return groups;
}

// ─── State grouping helper ───────────────────────────────────────────────────

function groupByStateFamily(tokensList: any[]): any[][] {
  const families: any[][] = [];
  const used = new Set<string>();

  for (const t of tokensList) {
    if (used.has(t.name)) continue;

    // Find base name (without state suffix pattern)
    // e.g. "bg.brand.default" → find "bg.brand.hovered", "bg.brand.pressed"
    const baseName = t.name.replace(/\.(default|hovered|pressed|focused|disabled|error)$/, '');
    const family = tokensList.filter(other =>
      !used.has(other.name) &&
      other.name.replace(/\.(default|hovered|pressed|focused|disabled|error)$/, '') === baseName
    );

    if (family.length > 1) {
      // Sort: default first, then hover, pressed, focused, disabled, error
      const stateOrder = ['default', undefined, 'hovered', 'pressed', 'focused', 'disabled', 'error'];
      family.sort((a: any, b: any) => {
        const ai = stateOrder.indexOf(a.state || 'default');
        const bi = stateOrder.indexOf(b.state || 'default');
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      families.push(family);
      family.forEach((f: any) => used.add(f.name));
    } else {
      families.push([t]);
      used.add(t.name);
    }
  }

  return families;
}

// ─── Semantic Colors Section (enhanced) ──────────────────────────────────────

function SemanticColorsSection() {
  const color = tokens.color;
  const [viewMode, setViewMode] = useState<'property' | 'role'>('role');
  const [search, setSearch] = useState('');
  const [expandedToken, setExpandedToken] = useState<string | null>(null);

  const properties = ['text', 'background', 'border', 'icon'] as const;
  const totalTokens = properties.reduce((sum, p) => sum + color[p].tokens.length, 0);

  // Collect all tokens with their property
  const allTokensWithProperty = properties.flatMap(p =>
    color[p].tokens.map((t: any) => ({ ...t, property: p }))
  );

  // Search filter
  const searchLower = search.toLowerCase().trim();
  const filtered = searchLower
    ? allTokensWithProperty.filter((t: any) =>
        t.name.toLowerCase().includes(searchLower) ||
        t.hex.toLowerCase().includes(searchLower) ||
        (t.usage || '').toLowerCase().includes(searchLower) ||
        (t.token || '').toLowerCase().includes(searchLower) ||
        (t.components || []).some((c: string) => c.toLowerCase().includes(searchLower))
      )
    : allTokensWithProperty;

  const tokensByRole = groupTokensByRole(filtered);
  const roleOrder = ['neutral', 'brand', 'danger', 'success', 'warning', 'information', 'disabled', 'selected', 'input'];

  function handleSelect(name: string) {
    setExpandedToken(prev => prev === name ? null : name);
  }

  const selectedTokenData = expandedToken
    ? filtered.find((t: any) => t.name === expandedToken) || null
    : null;

  function renderTokenList(tokensList: any[]) {
    const families = groupByStateFamily(tokensList);
    const multiState = families.filter(f => f.length > 1);
    const singles = families.filter(f => f.length === 1).map(f => f[0]);

    return (
      <>
        {multiState.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: singles.length > 0 ? 12 : 0 }}>
            {multiState.map(family => (
              <StateGroup
                key={family[0].name}
                tokens={family}
                selectedToken={expandedToken}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
        {singles.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {singles.map((t: any) => (
              <CompactSwatch
                key={t.name}
                t={t}
                isSelected={expandedToken === t.name}
                onSelect={() => handleSelect(t.name)}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <Section title="Semantic Colors" badge={`${totalTokens} tokens`}>
      {/* Description */}
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>
        Purpose-driven color tokens that express design intent. Access via{' '}
        <span style={S.code}>theme.mcui.palette.*</span>
      </div>
      <div style={{
        fontSize: 12,
        color: '#9CA3AF',
        marginBottom: 16,
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        Naming: color.[property].[role].[emphasis].[state]
      </div>

      {/* Search + View toggle row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 340 }}>
          <span style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 14,
            color: '#9CA3AF',
            pointerEvents: 'none',
          }}>
            &#x1F50D;
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tokens, hex, components..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              fontSize: 12,
              fontFamily: "'DM Sans', sans-serif",
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              outline: 'none',
              color: '#111827',
              background: '#fff',
              transition: 'border-color 150ms',
            }}
            onFocus={e => { e.target.style.borderColor = '#346bea'; }}
            onBlur={e => { e.target.style.borderColor = '#E5E7EB'; }}
          />
          {search && (
            <span style={{ marginLeft: 8, fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap' }}>
              {filtered.length} / {totalTokens} tokens
            </span>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['role', 'property'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                border: '1px solid',
                borderColor: viewMode === mode ? '#346bea' : '#E5E7EB',
                borderRadius: 6,
                background: viewMode === mode ? '#EFF6FF' : '#fff',
                color: viewMode === mode ? '#1D4ED8' : '#6B7280',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              {mode === 'role' ? 'By Role' : 'By Property'}
            </button>
          ))}
        </div>
      </div>

      {/* No results */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 13 }}>
          No tokens matching "<strong>{search}</strong>"
        </div>
      )}

      {filtered.length > 0 && viewMode === 'role' ? (
        /* ── Role-based view ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {roleOrder.filter(r => tokensByRole[r]).map(role => {
            const meta = ROLE_META[role] || ROLE_META.neutral;
            const roleTokens = tokensByRole[role];
            return (
              <div key={role}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 14,
                }}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    color: meta.color,
                    background: meta.bg,
                    border: `1px solid ${meta.border}`,
                    borderRadius: 6,
                    padding: '4px 10px',
                  }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                    {roleTokens.length} tokens
                  </span>
                </div>

                {/* Group within role by property */}
                {properties.filter(p => roleTokens.some((t: any) => t.property === p)).map(prop => (
                  <div key={prop} style={{ marginBottom: 16 }}>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#9CA3AF',
                      marginBottom: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <span style={{ fontSize: 13 }}>{PROPERTY_META[prop].icon}</span>
                      {PROPERTY_META[prop].label}
                    </div>
                    {renderTokenList(roleTokens.filter((t: any) => t.property === prop))}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : filtered.length > 0 ? (
        /* ── Property-based view ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {properties.map((key) => {
            const propTokens = filtered.filter((t: any) => t.property === key);
            if (propTokens.length === 0) return null;
            return (
              <div key={key}>
                <div style={{ ...S.subsectionLabel, marginTop: 0 }}>
                  {PROPERTY_META[key].icon} {PROPERTY_META[key].label}
                  {' — '}
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    {color[key].description}
                  </span>
                  <span style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#9CA3AF',
                    background: '#F3F4F6',
                    borderRadius: 20,
                    padding: '1px 7px',
                    textTransform: 'none',
                    letterSpacing: 0,
                  }}>
                    {propTokens.length}
                  </span>
                </div>
                {renderTokenList(propTokens)}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Fixed bottom detail panel */}
      {selectedTokenData && (
        <TokenDetailPanel
          token={selectedTokenData}
          allTokens={filtered}
          onClose={() => setExpandedToken(null)}
          onSelectSibling={handleSelect}
        />
      )}
    </Section>
  );
}

// ─── Atomic Colors Section ───────────────────────────────────────────────────

function AtomicColorSwatch({ swatch, familyName }: {
  swatch: any;
  familyName: string;
}) {
  const [copied, setCopied] = useState(false);
  const isDark = isColorDark(swatch.hex);

  function handleCopy() {
    navigator.clipboard.writeText(swatch.hex).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div
      onClick={handleCopy}
      title={`${familyName} ${swatch.name} — ${swatch.hex}`}
      style={{
        flex: '1 1 0',
        minWidth: 0,
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'transform 150ms ease',
      }}
    >
      <div style={{
        height: 56,
        background: swatch.hex,
        borderRadius: swatch.name === '50' ? '8px 0 0 8px'
          : swatch.name === '900' ? '0 8px 8px 0'
          : 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 600,
        color: copied ? (isDark ? '#fff' : '#111') : 'transparent',
        transition: 'color 150ms',
        outline: swatch.primary ? '2px solid #111827' : 'none',
        outlineOffset: -2,
        position: 'relative',
      }}>
        {copied ? 'Copied!' : ''}
        {swatch.primary && (
          <div style={{
            position: 'absolute',
            top: 3,
            right: 4,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isDark ? '#fff' : '#111',
            opacity: 0.6,
          }} />
        )}
      </div>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: '#374151',
        marginTop: 6,
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        {swatch.name}
      </div>
      <div style={{
        fontSize: 9,
        color: '#9CA3AF',
        fontFamily: "'IBM Plex Mono', monospace",
      }}>
        {swatch.hex}
      </div>
    </div>
  );
}

function AtomicColorsSection() {
  const palette = tokens.colorPalette;
  const totalSwatches = palette.families.reduce((sum: number, f: any) => sum + f.swatches.length, 0);

  return (
    <Section title="Atomic Colors" badge={`${palette.families.length} families · ${totalSwatches} swatches`}>
      {/* Description */}
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 6 }}>
        {palette.description}
      </div>
      <div style={{
        fontSize: 12,
        color: '#9CA3AF',
        marginBottom: 24,
      }}>
        Raw color scales that semantic tokens reference. Avoid using directly in components — prefer semantic tokens above.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {palette.families.map((family: any) => {
          const primary = family.swatches.find((s: any) => s.primary);
          return (
            <div key={family.name}>
              {/* Family header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
              }}>
                {primary && (
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: primary.hex,
                    border: '1px solid rgba(0,0,0,0.08)',
                    flexShrink: 0,
                  }} />
                )}
                <div>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#111827',
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}>
                    {family.name}
                  </span>
                  <span style={{
                    fontSize: 12,
                    color: '#9CA3AF',
                    marginLeft: 10,
                  }}>
                    {family.description}
                  </span>
                </div>
                {primary && (
                  <span style={{
                    ...S.code,
                    fontSize: 10,
                    marginLeft: 'auto',
                  }}>
                    Primary: {primary.hex}
                  </span>
                )}
              </div>

              {/* Swatch scale bar */}
              <div style={{
                display: 'flex',
                gap: 0,
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 10,
                padding: '12px 8px',
              }}>
                {family.swatches.map((s: any) => (
                  <AtomicColorSwatch key={s.name} swatch={s} familyName={family.name} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Spacing Section ──────────────────────────────────────────────────────────

function SpacingSection() {
  const spacing = tokens.spacing;
  const categoryColors: Record<string, string> = {
    inline: '#EFF6FF',
    inset: '#F0FDF4',
    stack: '#FFF7ED',
    layout: '#FDF4FF',
  };
  const categoryBorders: Record<string, string> = {
    inline: '#BFDBFE',
    inset: '#BBF7D0',
    stack: '#FED7AA',
    layout: '#E9D5FF',
  };
  const categoryText: Record<string, string> = {
    inline: '#1D4ED8',
    inset: '#15803D',
    stack: '#C2410C',
    layout: '#7E22CE',
  };

  return (
    <Section title="Spacing" badge={`base unit: ${spacing.baseUnit}px`}>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
        <span style={S.code}>{spacing.usage}</span>
        <span style={{ marginLeft: 8 }}>{spacing.multiArgument}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {spacing.values.map((v: any) => (
          <div key={v.multiplier} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '10px 14px',
            background: categoryColors[v.category] || '#F9FAFB',
            border: `1px solid ${categoryBorders[v.category] || '#E5E7EB'}`,
            borderRadius: 8,
          }}>
            {/* Visual bar */}
            <div style={{
              width: v.px,
              height: v.px,
              minWidth: v.px,
              background: categoryText[v.category] || '#346bea',
              opacity: 0.25,
              borderRadius: 3,
              flexShrink: 0,
            }} />
            {/* Metadata */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                <span style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#111827',
                }}>
                  spacing({v.multiplier})
                </span>
                <span style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 12,
                  color: '#6B7280',
                }}>
                  = {v.px}px
                </span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: categoryText[v.category] || '#374151',
                  background: categoryColors[v.category],
                  border: `1px solid ${categoryBorders[v.category]}`,
                  borderRadius: 20,
                  padding: '1px 8px',
                }}>
                  {v.category}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>{v.usage}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Category legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
        {Object.entries(spacing.categories).map(([key, cat]: [string, any]) => (
          <div key={key} style={{
            fontSize: 12,
            color: '#6B7280',
            background: categoryColors[key] || '#F9FAFB',
            border: `1px solid ${categoryBorders[key] || '#E5E7EB'}`,
            borderRadius: 6,
            padding: '6px 12px',
          }}>
            <span style={{ fontWeight: 600, color: categoryText[key] || '#374151' }}>{key}</span>
            {' '}{cat.range} — {cat.description}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Typography Section ───────────────────────────────────────────────────────

function TypographySection() {
  const typo = tokens.typography;
  const headings = typo.tokens.filter((t: any) => t.category === 'heading');
  const body = typo.tokens.filter((t: any) => t.category === 'body');

  function TypoRow({ t }: { t: any }) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 20,
        padding: '12px 16px',
        borderRadius: 8,
        border: '1px solid #E5E7EB',
        marginBottom: 8,
        background: '#fff',
      }}>
        {/* Sample */}
        <div style={{
          fontSize: t.size,
          fontWeight: t.weight,
          lineHeight: t.lineHeight || 'normal',
          letterSpacing: t.letterSpacing || 'normal',
          color: '#111827',
          minWidth: 260,
          fontFamily: "'DM Sans', sans-serif",
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          The quick brown fox
        </div>
        {/* Metadata */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', flex: 1 }}>
          <span style={{ ...S.code, fontSize: 12, fontWeight: 600 }}>{t.name}</span>
          <span style={S.code}>{t.size}</span>
          <span style={S.code}>weight {t.weight}</span>
          {t.lineHeight && <span style={S.code}>lh {t.lineHeight}</span>}
          {t.letterSpacing && <span style={S.code}>ls {t.letterSpacing}</span>}
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{t.usage}</span>
        </div>
      </div>
    );
  }

  return (
    <Section title="Typography" badge={`${typo.tokens.length} tokens`}>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
        Access via <span style={S.code}>{typo.usage}</span>
      </div>

      <div style={{ ...S.subsectionLabel, marginTop: 0 }}>Headings</div>
      {headings.map((t: any) => <TypoRow key={t.name} t={t} />)}

      <div style={{ ...S.subsectionLabel }}>Body</div>
      {body.map((t: any) => <TypoRow key={t.name} t={t} />)}
    </Section>
  );
}

// ─── Elevation Section ────────────────────────────────────────────────────────

function ElevationSection() {
  const elevation = tokens.elevation;

  return (
    <Section title="Elevation" badge={`${elevation.levels.length} levels`}>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
        {elevation.usage}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {elevation.levels.map((level: any) => (
          <div key={level.name} style={{
            flex: '1 1 180px',
            maxWidth: 240,
          }}>
            <div style={{
              background: level.surface,
              boxShadow: level.shadow === 'none' ? 'none' : level.shadow,
              border: level.shadow === 'none' ? '1px solid #E5E7EB' : 'none',
              borderRadius: 10,
              padding: 20,
              height: 80,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
            }}>
              <span style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: '#374151',
                textTransform: 'capitalize',
              }}>
                {level.name}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
              z-index: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{level.zIndex}</span>
            </div>
            {level.shadow !== 'none' && (
              <div style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9,
                color: '#9CA3AF',
                marginBottom: 4,
                wordBreak: 'break-all',
              }}>
                {level.shadow}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{level.usage}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Border Radius Section ────────────────────────────────────────────────────

function BorderRadiusSection() {
  const { tokens: radii } = tokens.borderRadius;

  return (
    <Section title="Border Radius" badge={`${radii.length} tokens`}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {radii.map((r: any) => (
          <div key={r.name} style={{
            flex: '1 1 140px',
            maxWidth: 200,
            textAlign: 'center',
          }}>
            <div style={{
              width: 80,
              height: 80,
              background: '#EFF6FF',
              border: '2px solid #346bea',
              borderRadius: r.value,
              margin: '0 auto 12px',
            }} />
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              color: '#111827',
              marginBottom: 4,
            }}>
              {r.value}
            </div>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#374151',
              marginBottom: 4,
            }}>
              {r.name}
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{r.usage}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Animation Section ────────────────────────────────────────────────────────

function AnimationSection() {
  const anim = tokens.animation;

  return (
    <Section title="Animation" badge={`${anim.durations.length} durations · ${anim.easings.length} easings`}>
      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {/* Durations */}
        <div style={{ flex: '1 1 280px' }}>
          <div style={{ ...S.subsectionLabel, marginTop: 0 }}>Durations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {anim.durations.map((d: any) => (
              <div key={d.name} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 6,
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: '#346bea',
                  opacity: d.value === '0ms' ? 0.1 : Math.min(0.9, parseInt(d.value) / 500 + 0.1),
                  flexShrink: 0,
                }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ ...S.code, fontSize: 12 }}>{d.value}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{d.name.replace('duration.', '')}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#9CA3AF' }}>{d.usage}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Easings */}
        <div style={{ flex: '1 1 280px' }}>
          <div style={{ ...S.subsectionLabel, marginTop: 0 }}>Easings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {anim.easings.map((e: any) => (
              <div key={e.name} style={{
                padding: '8px 12px',
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                    {e.name.replace('easing.', '')}
                  </span>
                </div>
                <div style={{ ...S.code, fontSize: 10, marginBottom: 4, display: 'inline-block' }}>{e.value}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>{e.usage}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

// ─── Breakpoints Section ──────────────────────────────────────────────────────

function BreakpointsSection() {
  const bp = tokens.breakpoints;

  return (
    <Section title="Breakpoints" badge={`${bp.values.length} breakpoints`}>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>{bp.usage}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bp.values.map((b: any, i: number) => {
          const widthPct = b.name === 'xs' ? 15
            : b.name === 'sm' ? 30
            : b.name === 'md' ? 50
            : b.name === 'lg' ? 75
            : 100;
          return (
            <div key={b.name} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '10px 14px',
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
            }}>
              {/* Bar */}
              <div style={{ width: 160, flexShrink: 0, background: '#E5E7EB', borderRadius: 4, height: 8 }}>
                <div style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  background: i === 3 ? '#346bea' : '#93C5FD',
                  borderRadius: 4,
                }} />
              </div>
              <span style={{ ...S.code, fontSize: 12, minWidth: 60 }}>{b.value}</span>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#111827',
                minWidth: 30,
              }}>{b.name}</span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>{b.description}</span>
              {b.name === 'lg' && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#1D4ED8',
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: 20,
                  padding: '1px 8px',
                }}>primary target</span>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TokensPage() {
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>Design Tokens</h1>
      <p style={S.pageSubtitle}>
        Visual reference for all design tokens from{' '}
        <span style={S.code}>design-system/src/tokens.json</span>
        {' '}— v{tokens.meta.version}, updated {tokens.meta.lastUpdated}
      </p>

      <SemanticColorsSection />
      <AtomicColorsSection />
      <SpacingSection />
      <TypographySection />
      <ElevationSection />
      <BorderRadiusSection />
      <AnimationSection />
      <BreakpointsSection />
    </div>
  );
}

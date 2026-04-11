import React from 'react';

// ─── Shared styles ───────────────────────────────────────────────────────────

const font = {
  heading: "'Plus Jakarta Sans', sans-serif",
  body: "'DM Sans', sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

const color = {
  text: '#111827',
  textSub: '#6B7280',
  textMuted: '#9CA3AF',
  brand: '#346bea',
  brandBg: '#EFF6FF',
  brandBorder: '#BFDBFE',
  border: '#E5E7EB',
  bg: '#F9FAFB',
  white: '#FFFFFF',
  danger: '#B91C1C',
  dangerBg: '#FEF2F2',
  success: '#15803D',
  successBg: '#F0FDF4',
  warning: '#A16207',
  warningBg: '#FFFBEB',
  info: '#0369A1',
  infoBg: '#F0F9FF',
};

// ─── Components ──────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontFamily: font.heading,
      fontSize: 20,
      fontWeight: 700,
      color: color.text,
      marginBottom: 8,
      marginTop: 0,
    }}>
      {children}
    </h2>
  );
}

function SectionDesc({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 13,
      color: color.textSub,
      marginBottom: 20,
      marginTop: 0,
      lineHeight: 1.6,
      maxWidth: 720,
    }}>
      {children}
    </p>
  );
}

function Card({ href, children, accent }: {
  href?: string;
  children: React.ReactNode;
  accent?: string;
}) {
  const Tag = href ? 'a' : 'div';
  return (
    <Tag
      href={href}
      style={{
        display: 'block',
        padding: '18px 20px',
        border: `1px solid ${color.border}`,
        borderRadius: 10,
        background: color.white,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'box-shadow 150ms, border-color 150ms',
        borderLeft: accent ? `3px solid ${accent}` : undefined,
        cursor: href ? 'pointer' : 'default',
      }}
    >
      {children}
    </Tag>
  );
}

function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      color: fg,
      background: bg,
      borderRadius: 4,
      padding: '2px 7px',
      fontFamily: font.mono,
    }}>
      {label}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10,
      fontFamily: font.mono,
      color: color.brand,
      background: color.brandBg,
      border: `1px solid ${color.brandBorder}`,
      borderRadius: 4,
      padding: '2px 6px',
    }}>
      {children}
    </span>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const NAV_CARDS = [
  { label: 'Tokens', desc: 'Colors, spacing, typography, elevation, animation', path: '/tokens', stat: '74 semantic + 70 atomic colors', accent: '#346bea' },
  { label: 'Components', desc: 'Live interactive component previews', path: '/components', stat: '48+ components', accent: '#429746' },
  { label: 'Patterns', desc: 'Page composition patterns & blueprints', path: '/patterns', stat: '20 patterns', accent: '#A16207' },
  { label: 'Conventions', desc: 'Naming, file structure, import rules', path: '/conventions', stat: 'MC/MT/SC/ME prefixes', accent: '#B91C1C' },
  { label: 'API Contracts', desc: 'Proto to UI mapping & data flow', path: '/api-contracts', stat: '6 entities mapped', accent: '#0369A1' },
];

const LAYERS = [
  {
    name: 'Tokens',
    file: 'tokens.json',
    desc: 'Visual primitives: colors, spacing, typography, elevation, border radius, animation',
    icon: '◆',
    color: color.brand,
  },
  {
    name: 'Components',
    file: 'components.json',
    desc: '48 UI components with props, states, accessibility, dos/don\'ts',
    icon: '□',
    color: '#7C3AED',
  },
  {
    name: 'Behaviors',
    file: 'component-behaviors.json',
    desc: 'Semantic actions, data flow, event triggers per component',
    icon: '⇄',
    color: '#0891B2',
  },
  {
    name: 'State Machines',
    file: 'state-machines.json',
    desc: 'State transitions: idle → focused → error → disabled',
    icon: '⟳',
    color: '#059669',
  },
  {
    name: 'Patterns',
    file: 'patterns.json',
    desc: '20 composition patterns + page blueprints for scaffolding',
    icon: '▤',
    color: '#D97706',
  },
  {
    name: 'Conventions',
    file: 'conventions.json',
    desc: 'Naming, file structure, 3-layer architecture rules',
    icon: '≡',
    color: '#DC2626',
  },
  {
    name: 'API Contracts',
    file: 'api-ui-contracts.json',
    desc: 'Proto field → model → UI component mapping per entity',
    icon: '↔',
    color: '#0284C7',
  },
];

const DS_FILES: Array<{ file: string; purpose: string; category: string }> = [
  { file: 'tokens.json', purpose: 'Colors, spacing, typography, elevation, animation', category: 'Foundation' },
  { file: 'semantic-palette.json', purpose: 'theme.mcui.palette.* → hex mapping (light/dark)', category: 'Foundation' },
  { file: 'components.json', purpose: '48 components: props, accessibility, states', category: 'Components' },
  { file: 'component-behaviors.json', purpose: 'Semantic actions & data flow per component', category: 'Components' },
  { file: 'component-dependencies.json', purpose: 'Provider/context requirements per component', category: 'Components' },
  { file: 'state-machines.json', purpose: 'Component state transitions', category: 'Components' },
  { file: 'patterns.json', purpose: '20 composition patterns + page blueprints', category: 'Architecture' },
  { file: 'conventions.json', purpose: 'Naming, file structure, import rules', category: 'Architecture' },
  { file: 'api-ui-contracts.json', purpose: 'Proto → model → UI mapping', category: 'Architecture' },
  { file: 'code-examples.json', purpose: 'Real code examples per page pattern', category: 'Guides' },
  { file: 'error-patterns.json', purpose: '22 common errors with fix strategies', category: 'Guides' },
  { file: 'generation-protocol.json', purpose: '5-phase code generation protocol', category: 'Agent Protocol' },
  { file: 'validation-runner.json', purpose: '16 design system validation rules', category: 'Agent Protocol' },
  { file: 'ux-criteria.json', purpose: 'UX evaluation criteria', category: 'Agent Protocol' },
  { file: 'visual-inspection.json', purpose: 'Screenshot-based visual checks', category: 'Agent Protocol' },
  { file: 'auto-fix-loop.json', purpose: 'Auto-fix strategies for validation failures', category: 'Agent Protocol' },
  { file: 'index.json', purpose: 'Task-based file loading guide & decision trees', category: 'Agent Protocol' },
];

const CATEGORIES = ['Foundation', 'Components', 'Architecture', 'Guides', 'Agent Protocol'];
const CATEGORY_COLORS: Record<string, { fg: string; bg: string }> = {
  Foundation: { fg: color.brand, bg: color.brandBg },
  Components: { fg: '#7C3AED', bg: '#F5F3FF' },
  Architecture: { fg: color.warning, bg: color.warningBg },
  Guides: { fg: color.success, bg: color.successBg },
  'Agent Protocol': { fg: color.info, bg: color.infoBg },
};

// ─── Page ────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  return (
    <div style={{ fontFamily: font.body, color: color.text, maxWidth: 1100 }}>

      {/* ── Hero ── */}
      <div style={{ marginBottom: 48 }}>
        <h1 style={{
          fontFamily: font.heading,
          fontSize: 32,
          fontWeight: 800,
          marginBottom: 12,
          color: color.text,
          letterSpacing: '-0.02em',
        }}>
          MSM Portal Design System
        </h1>
        <p style={{
          fontSize: 16,
          color: color.textSub,
          lineHeight: 1.7,
          maxWidth: 680,
          marginBottom: 0,
          marginTop: 0,
        }}>
          An agent-readable design system that bridges design intent and code generation.
          Built so that AI agents can autonomously understand, generate, and validate
          UI code that matches production quality standards.
        </p>
      </div>

      {/* ── Philosophy ── */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle>Philosophy</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            {
              title: 'Agent-First',
              desc: 'Every design decision is encoded as structured JSON. Agents read tokens, state machines, and validation rules — not Figma.',
              keyword: 'Structured Data',
              icon: '{ }',
              accent: '#346bea',
              accentBg: '#EFF6FF',
            },
            {
              title: 'Closed Loop',
              desc: 'Generate → Validate → Screenshot → Verify. Agents autonomously check output against 16 rules and visual criteria.',
              keyword: 'Self-Verifying',
              icon: '⟳',
              accent: '#059669',
              accentBg: '#ECFDF5',
            },
            {
              title: 'Single Source of Truth',
              desc: 'One JSON file per concern. Tokens define the visual language. Components define building blocks. Patterns define composition.',
              keyword: '17 JSON Files',
              icon: '◇',
              accent: '#7C3AED',
              accentBg: '#F5F3FF',
            },
          ].map(p => (
            <div key={p.title} style={{
              borderRadius: 12,
              overflow: 'hidden',
              border: `1px solid ${color.border}`,
              background: color.white,
              transition: 'box-shadow 200ms ease',
            }}>
              {/* Accent header strip */}
              <div style={{
                height: 80,
                background: `linear-gradient(135deg, ${p.accentBg}, ${color.white})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}>
                <span style={{
                  fontSize: 28,
                  fontFamily: font.mono,
                  fontWeight: 700,
                  color: p.accent,
                  opacity: 0.9,
                }}>
                  {p.icon}
                </span>
                {/* Keyword badge */}
                <span style={{
                  position: 'absolute',
                  top: 10,
                  right: 12,
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: font.mono,
                  color: p.accent,
                  background: color.white,
                  border: `1px solid ${p.accent}30`,
                  borderRadius: 4,
                  padding: '2px 7px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {p.keyword}
                </span>
              </div>
              {/* Content */}
              <div style={{ padding: '16px 18px 20px' }}>
                <div style={{
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: font.heading,
                  color: color.text,
                  marginBottom: 8,
                }}>
                  {p.title}
                </div>
                <div style={{
                  fontSize: 13,
                  color: color.textSub,
                  lineHeight: 1.65,
                }}>
                  {p.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Architecture Layers ── */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle>Architecture</SectionTitle>
        <SectionDesc>
          The design system is organized in layers of increasing abstraction.
          Lower layers define primitives, higher layers define composition rules.
        </SectionDesc>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          border: `1px solid ${color.border}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          {LAYERS.map((layer, i) => (
            <div key={layer.name} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 18px',
              background: i % 2 === 0 ? color.white : color.bg,
              borderTop: i > 0 ? `1px solid ${color.border}` : 'none',
            }}>
              <span style={{
                fontSize: 18,
                color: layer.color,
                width: 28,
                textAlign: 'center',
                flexShrink: 0,
              }}>
                {layer.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: font.heading,
                    color: color.text,
                  }}>
                    {layer.name}
                  </span>
                  <span style={{
                    fontSize: 10,
                    fontFamily: font.mono,
                    color: color.textMuted,
                    background: color.bg,
                    border: `1px solid ${color.border}`,
                    borderRadius: 4,
                    padding: '1px 6px',
                  }}>
                    {layer.file}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: color.textSub, marginTop: 2 }}>
                  {layer.desc}
                </div>
              </div>
              <div style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: `${layer.color}15`,
                border: `1px solid ${layer.color}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                color: layer.color,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {i + 1}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Agent Workflow ── */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle>Agent Workflow</SectionTitle>
        <SectionDesc>
          AI agents follow a 5-phase protocol when generating UI code. Each phase references specific design system files.
        </SectionDesc>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { phase: '1', label: 'Understand', desc: 'Load task-specific files via index.json', color: '#346bea' },
            { phase: '2', label: 'Plan', desc: 'Select pattern, plan file structure', color: '#7C3AED' },
            { phase: '3', label: 'Generate', desc: 'Page → Container → Component (3-layer)', color: '#059669' },
            { phase: '4', label: 'Validate', desc: 'Run 16 automated checks', color: '#D97706' },
            { phase: '5', label: 'Evaluate', desc: 'UX criteria + visual inspection', color: '#DC2626' },
          ].map((p, i) => (
            <React.Fragment key={p.phase}>
              <div style={{
                flex: '1 1 150px',
                padding: '14px 16px',
                border: `1px solid ${color.border}`,
                borderRadius: 8,
                background: color.white,
                textAlign: 'center',
                minWidth: 140,
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: `${p.color}12`,
                  border: `2px solid ${p.color}`,
                  color: p.color,
                  fontSize: 13,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px',
                  fontFamily: font.heading,
                }}>
                  {p.phase}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: color.text, fontFamily: font.heading, marginBottom: 4 }}>
                  {p.label}
                </div>
                <div style={{ fontSize: 11, color: color.textSub, lineHeight: 1.4 }}>
                  {p.desc}
                </div>
              </div>
              {i < 4 && (
                <div style={{ display: 'flex', alignItems: 'center', color: color.textMuted, fontSize: 16, flexShrink: 0 }}>
                  →
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Auto-fix loop note */}
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          background: color.warningBg,
          border: `1px solid #FDE68A`,
          borderRadius: 8,
          fontSize: 12,
          color: color.warning,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>{'\u{1F504}'}</span>
          <span>
            When validation (Phase 4) fails, agents auto-fix using <Tag>auto-fix-loop.json</Tag> strategies and re-validate up to 3 iterations.
          </span>
        </div>
      </div>

      {/* ── 3-Layer Architecture ── */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle>3-Layer Architecture</SectionTitle>
        <SectionDesc>
          Every feature follows a mandatory Page → Container → Component separation.
        </SectionDesc>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            {
              layer: 'Page',
              location: 'src/apps/{client}/page/{entity}/',
              responsibility: 'Thin wrapper. Imports and renders Container. No logic.',
              color: '#346bea',
            },
            {
              layer: 'Container',
              location: 'src/apps/{client}/container/{entity}/{action}/',
              responsibility: 'Data fetching, state management, business logic, callbacks.',
              color: '#7C3AED',
            },
            {
              layer: 'Component',
              location: 'src/common/component/ or src/apps/{client}/component/',
              responsibility: 'Pure UI. Receives all data via props. No API calls.',
              color: '#059669',
            },
          ].map(l => (
            <Card key={l.layer} accent={l.color}>
              <div style={{
                fontSize: 15,
                fontWeight: 700,
                fontFamily: font.heading,
                color: l.color,
                marginBottom: 6,
              }}>
                {l.layer}
              </div>
              <div style={{
                fontSize: 10,
                fontFamily: font.mono,
                color: color.textMuted,
                marginBottom: 8,
                wordBreak: 'break-all',
              }}>
                {l.location}
              </div>
              <div style={{ fontSize: 12, color: color.textSub, lineHeight: 1.5 }}>
                {l.responsibility}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* ── File Map ── */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle>Design System Files</SectionTitle>
        <SectionDesc>
          17 JSON files organized by category. Each file serves a specific role in the agent workflow.
        </SectionDesc>

        <div style={{
          border: `1px solid ${color.border}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          {CATEGORIES.map((cat, ci) => {
            const files = DS_FILES.filter(f => f.category === cat);
            const catColor = CATEGORY_COLORS[cat];
            return (
              <React.Fragment key={cat}>
                {/* Category header */}
                <div style={{
                  padding: '8px 16px',
                  background: catColor.bg,
                  borderTop: ci > 0 ? `1px solid ${color.border}` : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <Badge label={cat} bg={catColor.bg} fg={catColor.fg} />
                  <span style={{ fontSize: 11, color: color.textMuted }}>{files.length} files</span>
                </div>
                {/* Files */}
                {files.map((f, fi) => (
                  <div key={f.file} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 16px 8px 28px',
                    borderTop: `1px solid ${color.border}`,
                    background: fi % 2 === 0 ? color.white : color.bg,
                  }}>
                    <span style={{
                      fontFamily: font.mono,
                      fontSize: 11,
                      fontWeight: 600,
                      color: color.text,
                      minWidth: 220,
                      flexShrink: 0,
                    }}>
                      {f.file}
                    </span>
                    <span style={{ fontSize: 12, color: color.textSub }}>
                      {f.purpose}
                    </span>
                  </div>
                ))}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Navigation Cards ── */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle>Explore</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {NAV_CARDS.map(card => (
            <Card key={card.label} href={card.path} accent={card.accent}>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: font.heading, marginBottom: 4 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 12, color: color.textSub, marginBottom: 8, lineHeight: 1.4 }}>
                {card.desc}
              </div>
              <div style={{ fontSize: 11, color: color.brand, fontWeight: 600, fontFamily: font.mono }}>
                {card.stat}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Naming Conventions Quick Ref ── */}
      <div style={{ marginBottom: 48 }}>
        <SectionTitle>Naming Conventions</SectionTitle>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { prefix: 'MC', meaning: 'Component', example: 'MCFormTextInput', color: '#346bea' },
            { prefix: 'MT', meaning: 'Type / Interface', example: 'MTFormFieldRef', color: '#7C3AED' },
            { prefix: 'SC', meaning: 'Styled Component', example: 'SCFormBody', color: '#D97706' },
            { prefix: 'ME', meaning: 'Enum', example: 'MERouteKey', color: '#DC2626' },
            { prefix: 'use', meaning: 'Hook', example: 'useEntityParam', color: '#059669' },
          ].map(n => (
            <div key={n.prefix} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              border: `1px solid ${color.border}`,
              borderRadius: 8,
              background: color.white,
              flex: '1 1 180px',
            }}>
              <span style={{
                fontFamily: font.mono,
                fontSize: 14,
                fontWeight: 800,
                color: n.color,
                minWidth: 32,
              }}>
                {n.prefix}
              </span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: color.text }}>{n.meaning}</div>
                <div style={{ fontSize: 10, fontFamily: font.mono, color: color.textMuted }}>{n.example}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Vision ── */}
      <div style={{
        padding: '20px 24px',
        background: `linear-gradient(135deg, ${color.brandBg}, #F5F3FF)`,
        border: `1px solid ${color.brandBorder}`,
        borderRadius: 12,
        marginBottom: 24,
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: 700,
          fontFamily: font.heading,
          color: color.brand,
          marginBottom: 8,
        }}>
          Vision
        </div>
        <div style={{
          fontFamily: font.mono,
          fontSize: 12,
          color: color.textSub,
          lineHeight: 1.8,
        }}>
          <div style={{ marginBottom: 4 }}>
            <span style={{ color: color.textMuted }}>Current:</span>{' '}
            Agent reads design system JSON, generates code <span style={{ color: color.textMuted }}>(one-way)</span>
          </div>
          <div>
            <span style={{ color: color.brand, fontWeight: 600 }}>Goal:</span>{' '}
            Agent executes, observes UI, validates changes <span style={{ color: color.brand, fontWeight: 600 }}>(closed loop)</span>
          </div>
          <div style={{ marginTop: 8, color: color.brand, fontWeight: 600, letterSpacing: '0.05em' }}>
            Document {'↔'} Code {'↔'} Execute {'↔'} Verify
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import componentsData from '../../../src/components.json';

const data = componentsData as any;

// ─── Storybook integration ───────────────────────────────────────────────────

const STORYBOOK_URL = import.meta.env.DEV
  ? 'http://localhost:6006'
  : `${window.location.origin}${import.meta.env.BASE_URL}storybook`;

const STORYBOOK_MAP: Record<string, string> = {
  MCButton2: 'library-mcbutton2--primary',
  MCFormTextInput: 'form-mcformtextinput--default',
  MCBarTabs: 'navigation-mcbartabs--twotabs',
  MCContentLayout: 'layout-mccontentlayout--withtitle',
  MCCommonDialog: 'feedback-mccommondialog--confirmdialog',
  MCStatus: 'datadisplay-mcstatus--allstatuses',
  MCFormSingleRichSelect: 'form-mcformsinglerichselect--default',
  MCAccordion: 'datadisplay-mcaccordion--expanded',
  MCMoreActionsButton: 'actions-mcmoreactionsbutton--default',
  MCFormPanel: 'form-mcformpanel--withtitle',
  MCFormNumberInput: 'form-mcformnumberinput--default',
  MCFormTextArea: 'form-mcformtextarea--default',
  MCFormChipInput: 'form-mcformchipinput--default',
  MCFormSwitchInput: 'form-mcformswitchinput--default',
  MCFormCheckBox: 'form-mcformcheckbox--default',
  MCFormRadioGroup: 'form-mcformradiogroup--default',
  MCFormInlineChipRichSelect: 'form-mcforminlinechiprichselect--default',
  MCFormMultiRichSelect: 'form-mcformmultirichselect--default',
  MCFormColorInput: 'form-mcformcolorinput--default',
  MCFormCardSelect: 'form-mcformcardselect--default',
  MCFormDateRangePicker: 'form-mcformdaterangepicker--default',
  MCFormDateTimeRangePicker: 'form-mcformdatetimerangepicker--default',
  MCDivider: 'ui-mcdivider--horizontal',
  MCPopover: 'ui-mcpopover--default',
  MCColorPicker: 'ui-mccolorpicker--default',
  MCTimer: 'ui-mctimer--default',
  MCMoreActionGroupsButton: 'ui-mcmoreactiongroupsbutton--singlegroup',
  MCFullScreenLoader: 'ui-mcfullscreenloader--default',
};

function useStorybookStatus() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(STORYBOOK_URL, { mode: 'no-cors' })
      .then(() => setAvailable(true))
      .catch(() => setAvailable(false));
  }, []);

  return available;
}

const font = {
  heading: "'Plus Jakarta Sans', sans-serif",
  body: "'DM Sans', sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

const cl = {
  text: '#111827',
  sub: '#6B7280',
  muted: '#9CA3AF',
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
  purple: '#7C3AED',
  purpleBg: '#F5F3FF',
};

const CATEGORY_COLORS: Record<string, string> = {
  'Form Inputs (v1)': '#346bea',
  'Form Shared': '#0891B2',
  'Form Layout': '#0369A1',
  'Buttons': '#DC2626',
  'Navigation': '#D97706',
  'Feedback & Overlay': '#7C3AED',
  'Display': '#059669',
  'Shared Styled': '#6B7280',
  'Moloco UI Primitives': '#111827',
};

// ─── Collapsible Section ─────────────────────────────────────────────────────

function Section({ title, defaultOpen = true, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          fontSize: 11, fontWeight: 700, color: cl.sub,
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: open ? 8 : 0,
          userSelect: 'none',
        }}
      >
        <span style={{
          display: 'inline-block', transition: 'transform 0.15s',
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          fontSize: 10,
        }}>
          ▶
        </span>
        {title}
      </div>
      {open && children}
    </div>
  );
}

// ─── Tag / Badge ─────────────────────────────────────────────────────────────

function Tag({ children, fg, bg }: { children: React.ReactNode; fg?: string; bg?: string }) {
  return (
    <span style={{
      fontSize: 10,
      fontFamily: font.mono,
      fontWeight: 600,
      color: fg || cl.brand,
      background: bg || cl.brandBg,
      border: `1px solid ${fg || cl.brand}20`,
      borderRadius: 4,
      padding: '2px 6px',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

// ─── Component Detail Dialog ─────────────────────────────────────────────────

function ComponentDialog({ comp, onClose, storybookAvailable }: {
  comp: any;
  onClose: () => void;
  storybookAvailable: boolean | null;
}) {
  const [copiedImport, setCopiedImport] = useState(false);
  const props = comp.props || [];
  const states = comp.states || [];
  const accessibility = comp.accessibility;
  const whenToUse = comp.when_to_use || [];
  const doNotUse = comp.do_not_use || [];
  const semanticActions = comp.semantic_actions || [];

  function copyImport() {
    if (comp.importStatement) {
      navigator.clipboard.writeText(comp.importStatement).then(() => {
        setCopiedImport(true);
        setTimeout(() => setCopiedImport(false), 1500);
      });
    }
  }

  const hasPreview = !!STORYBOOK_MAP[comp.name];

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
        zIndex: 999, backdropFilter: 'blur(2px)',
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', zIndex: 1000,
        background: cl.white, borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        width: hasPreview ? 1200 : 720, maxWidth: 'calc(100vw - 48px)',
        maxHeight: 'calc(100vh - 48px)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: `1px solid ${cl.border}`,
          display: 'flex', alignItems: 'flex-start', gap: 14,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 18, fontWeight: 700, fontFamily: font.heading, color: cl.text,
            }}>
              {comp.name}
            </div>
            <div style={{ fontSize: 13, color: cl.sub, marginTop: 4, lineHeight: 1.5 }}>
              {comp.description}
            </div>
            {comp.importStatement && (
              <div
                onClick={copyImport}
                style={{
                  marginTop: 8, fontFamily: font.mono, fontSize: 11,
                  color: cl.brand, background: cl.brandBg,
                  border: `1px solid ${cl.brandBorder}`,
                  borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
                  wordBreak: 'break-all',
                }}
              >
                {copiedImport ? 'Copied!' : comp.importStatement}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: `1px solid ${cl.border}`,
            background: cl.white, cursor: 'pointer', fontSize: 18, color: cl.sub,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            ×
          </button>
        </div>

        {/* Body: 2-panel layout when preview available */}
        <div style={{
          display: 'flex', flex: 1, minHeight: 0,
        }}>
          {/* Left panel: metadata */}
          <div style={{
            width: hasPreview ? 420 : '100%', flexShrink: 0,
            overflowY: 'auto', padding: '16px 24px 24px',
            borderRight: hasPreview ? `1px solid ${cl.border}` : 'none',
          }}>
            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {props.length > 0 && <Tag>{props.length} props</Tag>}
              {states.length > 0 && <Tag fg={cl.purple} bg={cl.purpleBg}>{states.length} states</Tag>}
              {comp.formikRequired && <Tag fg={cl.warning} bg={cl.warningBg}>Formik required</Tag>}
              {accessibility && <Tag fg={cl.success} bg={cl.successBg}>Accessible</Tag>}
              {semanticActions.length > 0 && <Tag fg="#0891B2" bg="#ECFEFF">{semanticActions.length} actions</Tag>}
            </div>

            {/* When to use / Don't use */}
            {(whenToUse.length > 0 || doNotUse.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {whenToUse.length > 0 && (
                  <div style={{
                    padding: '12px 14px', background: cl.successBg,
                    border: `1px solid #BBF7D0`, borderRadius: 8,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: cl.success, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      When to use
                    </div>
                    {whenToUse.map((w: string, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 3 }}>
                        • {w}
                      </div>
                    ))}
                  </div>
                )}
                {doNotUse.length > 0 && (
                  <div style={{
                    padding: '12px 14px', background: cl.dangerBg,
                    border: '1px solid #FECACA', borderRadius: 8,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: cl.danger, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                      Do NOT use
                    </div>
                    {doNotUse.map((d: string, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 3 }}>
                        • {d}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Props table */}
            {props.length > 0 && (
              <Section title={`Props (${props.length})`} defaultOpen={props.length <= 5}>
                <div style={{
                  border: `1px solid ${cl.border}`, borderRadius: 8, overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '120px 90px 40px 1fr',
                    padding: '8px 12px', background: cl.bg, borderBottom: `1px solid ${cl.border}`,
                    fontSize: 10, fontWeight: 700, color: cl.sub, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    <span>Name</span>
                    <span>Type</span>
                    <span>Req</span>
                    <span>Description</span>
                  </div>
                  {props.map((p: any, i: number) => (
                    <div key={p.name} style={{
                      display: 'grid', gridTemplateColumns: '120px 90px 40px 1fr',
                      padding: '6px 12px', borderTop: i > 0 ? `1px solid #F3F4F6` : 'none',
                      fontSize: 11, alignItems: 'baseline',
                    }}>
                      <span style={{ fontFamily: font.mono, fontWeight: 600, color: cl.text, fontSize: 10 }}>{p.name}</span>
                      <span style={{ fontFamily: font.mono, color: cl.purple, fontSize: 10 }}>{p.type}</span>
                      <span style={{ color: p.required ? cl.danger : cl.muted, fontWeight: 600 }}>
                        {p.required ? 'Yes' : '—'}
                      </span>
                      <span style={{ color: cl.sub, lineHeight: 1.4, fontSize: 10 }}>
                        {p.description}
                        {p.default && (
                          <span style={{ fontFamily: font.mono, color: cl.muted, marginLeft: 4, fontSize: 9 }}>
                            default: {p.default}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* States */}
            {states.length > 0 && (
              <Section title="States" defaultOpen={!hasPreview}>
                <div style={{
                  display: 'flex', gap: 0, alignItems: 'stretch', flexWrap: 'wrap',
                  border: `1px solid ${cl.border}`, borderRadius: 8, overflow: 'hidden',
                }}>
                  {states.map((s: any, i: number) => {
                    const stateColors: Record<string, { fg: string; bg: string }> = {
                      default: { fg: '#374151', bg: '#F9FAFB' },
                      hover: { fg: '#1D4ED8', bg: '#EFF6FF' },
                      focus: { fg: '#346bea', bg: '#EFF6FF' },
                      disabled: { fg: '#6B7280', bg: '#F3F4F6' },
                      error: { fg: '#B91C1C', bg: '#FEF2F2' },
                      readonly: { fg: '#6B7280', bg: '#F9FAFB' },
                      loading: { fg: '#D97706', bg: '#FFFBEB' },
                      active: { fg: '#059669', bg: '#ECFDF5' },
                      open: { fg: '#7C3AED', bg: '#F5F3FF' },
                      closed: { fg: '#374151', bg: '#F9FAFB' },
                      selected: { fg: '#1D4ED8', bg: '#EFF6FF' },
                      expanded: { fg: '#7C3AED', bg: '#F5F3FF' },
                      collapsed: { fg: '#374151', bg: '#F9FAFB' },
                    };
                    const sc = stateColors[s.name] || { fg: '#374151', bg: '#F9FAFB' };
                    return (
                      <div key={s.name} style={{
                        flex: 1, minWidth: 60, padding: '10px 8px', textAlign: 'center',
                        background: sc.bg,
                        borderLeft: i > 0 ? `1px solid ${cl.border}` : 'none',
                        position: 'relative',
                      }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: sc.fg, margin: '0 auto 6px', opacity: 0.7,
                        }} />
                        <div style={{
                          fontSize: 10, fontWeight: 700, fontFamily: font.mono,
                          color: sc.fg, marginBottom: 2,
                        }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: 9, color: cl.sub, lineHeight: 1.3 }}>
                          {s.description}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Semantic Actions */}
            {semanticActions.length > 0 && (
              <Section title="Semantic Actions" defaultOpen={!hasPreview}>
                {semanticActions.map((a: any, i: number) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, marginBottom: 6, fontSize: 11, alignItems: 'baseline',
                  }}>
                    <span style={{ color: cl.text, fontWeight: 600, minWidth: 140, flexShrink: 0 }}>{a.action}</span>
                    <span style={{ fontFamily: font.mono, fontSize: 10, color: cl.sub }}>{a.triggers}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Accessibility */}
            {accessibility && (
              <Section title="Accessibility" defaultOpen={!hasPreview}>
                <div style={{
                  padding: '12px 14px', background: cl.bg, border: `1px solid ${cl.border}`, borderRadius: 8,
                }}>
                  {accessibility.role && (
                    <div style={{ fontSize: 11, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: cl.text }}>Role:</span>
                      <span style={{ fontFamily: font.mono, color: cl.purple, marginLeft: 6 }}>{accessibility.role}</span>
                    </div>
                  )}
                  {accessibility.keyboardInteraction && (
                    <div style={{ marginTop: 6 }}>
                      {accessibility.keyboardInteraction.map((k: string, i: number) => (
                        <div key={i} style={{ fontSize: 10, color: cl.sub, marginBottom: 2, fontFamily: font.mono }}>
                          {k}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>
            )}
          </div>

          {/* Right panel: Live Preview */}
          {hasPreview && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              minWidth: 0, overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderBottom: `1px solid ${cl.border}`, flexShrink: 0,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: cl.sub, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Live Preview
                </div>
                <a
                  href={`${STORYBOOK_URL}/?path=/story/${STORYBOOK_MAP[comp.name]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 10, color: cl.brand, textDecoration: 'none', fontFamily: font.mono }}
                >
                  Open in Storybook →
                </a>
              </div>
              {storybookAvailable ? (
                <iframe
                  src={`${STORYBOOK_URL}/iframe.html?id=${STORYBOOK_MAP[comp.name]}&viewMode=story`}
                  style={{
                    flex: 1, width: '100%', border: 'none', display: 'block',
                  }}
                  title={`${comp.name} preview`}
                />
              ) : (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 40, background: cl.bg,
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: cl.sub, marginBottom: 8 }}>
                      Storybook is not running
                    </div>
                    <div style={{
                      fontFamily: font.mono, fontSize: 12, color: cl.text,
                      background: cl.white, border: `1px solid ${cl.border}`,
                      borderRadius: 6, padding: '8px 14px', display: 'inline-block',
                    }}>
                      cd msm-portal/js/msm-portal-web && pnpm storybook
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Component Card ──────────────────────────────────────────────────────────

function ComponentCard({ comp, categoryColor, onClick }: {
  comp: any;
  categoryColor: string;
  onClick: () => void;
}) {
  const propsCount = (comp.props || []).length;
  const statesCount = (comp.states || []).length;
  const tierMeta = TIER_META[comp.tier || 1];

  return (
    <div
      onClick={onClick}
      style={{
        padding: '0',
        border: `1px solid ${cl.border}`,
        borderRadius: 10,
        background: cl.white,
        cursor: 'pointer',
        transition: 'border-color 200ms, box-shadow 200ms, transform 200ms',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = categoryColor;
        el.style.boxShadow = `0 4px 12px ${categoryColor}15`;
        el.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = cl.border;
        el.style.boxShadow = 'none';
        el.style.transform = 'none';
      }}
    >
      {/* Top accent bar */}
      <div style={{ height: 3, background: categoryColor, opacity: 0.6 }} />

      <div style={{ padding: '12px 14px' }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, fontFamily: font.heading, color: cl.text,
            flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {comp.name}
          </div>
          <span style={{
            fontSize: 8, fontWeight: 700, fontFamily: font.mono,
            color: tierMeta.color, background: tierMeta.bg,
            border: `1px solid ${tierMeta.color}25`,
            borderRadius: 3, padding: '1px 5px', flexShrink: 0,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {tierMeta.label}
          </span>
        </div>

        {/* Description */}
        <div style={{
          fontSize: 11, color: cl.sub, lineHeight: 1.45, marginBottom: 10,
          height: 32, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {comp.description}
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {propsCount > 0 && (
            <span style={{
              fontSize: 10, fontFamily: font.mono, color: cl.sub,
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <span style={{ color: cl.brand, fontWeight: 700 }}>{propsCount}</span> props
            </span>
          )}
          {statesCount > 0 && (
            <>
              <span style={{ color: cl.border }}>|</span>
              <span style={{
                fontSize: 10, fontFamily: font.mono, color: cl.sub,
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                <span style={{ color: cl.purple, fontWeight: 700 }}>{statesCount}</span> states
              </span>
            </>
          )}
          {comp.formikRequired && (
            <>
              <span style={{ color: cl.border }}>|</span>
              <span style={{
                fontSize: 9, fontWeight: 700, color: cl.warning,
                fontFamily: font.mono,
              }}>
                Formik
              </span>
            </>
          )}
          {comp.accessibility && (
            <>
              <span style={{ color: cl.border }}>|</span>
              <span style={{ fontSize: 9, color: cl.success, fontWeight: 700 }}>A11y</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const TIER_META: Record<number, { label: string; desc: string; color: string; bg: string }> = {
  1: { label: 'Core', desc: 'Atomic/molecule UI primitives reusable across any feature', color: '#346bea', bg: '#EFF6FF' },
  2: { label: 'Composite', desc: 'Page-level compositions from Core components', color: '#7C3AED', bg: '#F5F3FF' },
  3: { label: 'Domain', desc: 'MSM Portal domain-specific components', color: '#D97706', bg: '#FFFBEB' },
  4: { label: 'Internal', desc: 'Styled components, enums, low-level helpers', color: '#6B7280', bg: '#F9FAFB' },
};

export function ComponentsPage() {
  const [search, setSearch] = useState('');
  const [selectedComp, setSelectedComp] = useState<any>(null);
  const [activeTier, setActiveTier] = useState<number | null>(null);
  const [showInternal, setShowInternal] = useState(false);
  const storybookAvailable = useStorybookStatus();

  const categories = data.categories || [];
  const searchLower = search.toLowerCase().trim();

  // Flatten all components
  const allComponents = categories.flatMap((cat: any) =>
    (cat.components || []).map((c: any) => ({ ...c, _category: cat.name }))
  );

  // Filter by search + tier
  const filtered = allComponents.filter((c: any) => {
    const tier = c.tier || 1;
    // Hide tier 4 unless toggled
    if (tier === 4 && !showInternal) return false;
    // Tier filter
    if (activeTier && tier !== activeTier) return false;
    // Search
    if (searchLower) {
      return c.name.toLowerCase().includes(searchLower) ||
        (c.description || '').toLowerCase().includes(searchLower) ||
        (c.when_to_use || []).some((w: string) => w.toLowerCase().includes(searchLower));
    }
    return true;
  });

  // Group by tier
  const tierOrder = [1, 2, 3, 4];
  const byTier = tierOrder.map(t => ({
    tier: t,
    meta: TIER_META[t],
    components: filtered.filter((c: any) => (c.tier || 1) === t),
  })).filter(g => g.components.length > 0);

  // Counts
  const visibleCount = filtered.length;
  const totalVisible = allComponents.filter((c: any) => (c.tier || 1) !== 4 || showInternal).length;
  const tierCounts = tierOrder.reduce((acc, t) => {
    acc[t] = allComponents.filter((c: any) => (c.tier || 1) === t).length;
    return acc;
  }, {} as Record<number, number>);

  return (
    <div style={{ fontFamily: font.body, color: cl.text, maxWidth: 1100 }}>
      <h1 style={{
        fontFamily: font.heading, fontSize: 28, fontWeight: 700, marginBottom: 8,
      }}>
        Components
      </h1>
      <p style={{ fontSize: 14, color: cl.sub, marginBottom: 20 }}>
        {tierCounts[1] + tierCounts[2]} design system components, {tierCounts[3]} domain-specific, {tierCounts[4]} internal.
      </p>

      {/* Tier criteria */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20,
        padding: '14px 16px', background: cl.bg, border: `1px solid ${cl.border}`, borderRadius: 10,
      }}>
        {[
          { tier: 1, question: 'Directly importable, reusable across any feature?' },
          { tier: 2, question: 'Composes Core components into page-level patterns?' },
          { tier: 3, question: 'Only meaningful in a specific business domain?' },
          { tier: 4, question: 'Used internally by other components, not imported directly?' },
        ].map(({ tier, question }) => {
          const meta = TIER_META[tier];
          return (
            <div key={tier} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{
                fontSize: 11, fontWeight: 800, fontFamily: font.mono,
                color: meta.color, background: meta.bg,
                border: `1px solid ${meta.color}30`,
                borderRadius: 4, padding: '1px 6px', flexShrink: 0,
              }}>
                T{tier}
              </span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>{meta.label}</div>
                <div style={{ fontSize: 10, color: cl.sub, lineHeight: 1.4, marginTop: 2 }}>{question}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tier filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTier(null)}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600, fontFamily: font.body,
            border: '1px solid', cursor: 'pointer', borderRadius: 6, transition: 'all 150ms',
            borderColor: !activeTier ? '#346bea' : cl.border,
            background: !activeTier ? '#EFF6FF' : cl.white,
            color: !activeTier ? '#1D4ED8' : cl.sub,
          }}
        >
          All ({totalVisible})
        </button>
        {tierOrder.filter(t => t !== 4).map(t => {
          const meta = TIER_META[t];
          const isActive = activeTier === t;
          return (
            <button
              key={t}
              onClick={() => setActiveTier(isActive ? null : t)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, fontFamily: font.body,
                border: '1px solid', cursor: 'pointer', borderRadius: 6, transition: 'all 150ms',
                borderColor: isActive ? meta.color : cl.border,
                background: isActive ? meta.bg : cl.white,
                color: isActive ? meta.color : cl.sub,
              }}
            >
              {meta.label} ({tierCounts[t]})
            </button>
          );
        })}
        <span style={{ width: 1, height: 20, background: cl.border, margin: '0 4px' }} />
        <button
          onClick={() => { setShowInternal(!showInternal); if (activeTier === 4) setActiveTier(null); }}
          style={{
            padding: '6px 14px', fontSize: 12, fontWeight: 600, fontFamily: font.body,
            border: '1px solid', cursor: 'pointer', borderRadius: 6, transition: 'all 150ms',
            borderColor: showInternal ? '#6B7280' : cl.border,
            background: showInternal ? '#F9FAFB' : cl.white,
            color: showInternal ? '#374151' : cl.muted,
          }}
        >
          Internal ({tierCounts[4]}) {showInternal ? '✓' : ''}
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 28, position: 'relative', maxWidth: 400 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search components by name, description..."
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            fontFamily: font.body, border: `1px solid ${cl.border}`, borderRadius: 8,
            outline: 'none', color: cl.text, background: cl.white,
          }}
          onFocus={e => { e.target.style.borderColor = cl.brand; }}
          onBlur={e => { e.target.style.borderColor = cl.border; }}
        />
        {search && (
          <div style={{ fontSize: 11, color: cl.sub, marginTop: 6 }}>
            {visibleCount} results
          </div>
        )}
      </div>

      {/* No results */}
      {byTier.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: cl.muted, fontSize: 13 }}>
          {search ? <>No components matching "<strong>{search}</strong>"</> : 'No components in this view'}
        </div>
      )}

      {/* Tier groups */}
      {byTier.map(({ tier, meta, components }) => {
        // Sub-group by original category within tier
        const catGroups: Array<{ name: string; comps: any[] }> = [];
        const seen = new Set<string>();
        for (const c of components) {
          if (!seen.has(c._category)) {
            seen.add(c._category);
            catGroups.push({ name: c._category, comps: [] });
          }
          catGroups.find(g => g.name === c._category)!.comps.push(c);
        }

        return (
          <div key={tier} style={{ marginBottom: 40 }}>
            {/* Tier header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
              padding: '10px 16px', background: meta.bg,
              border: `1px solid ${meta.color}20`, borderRadius: 8,
            }}>
              <span style={{
                fontSize: 15, fontWeight: 800, fontFamily: font.heading, color: meta.color,
              }}>
                Tier {tier}: {meta.label}
              </span>
              <span style={{ fontSize: 11, color: cl.muted }}>
                {components.length} components
              </span>
              <span style={{ fontSize: 11, color: cl.sub, marginLeft: 'auto' }}>
                {meta.desc}
              </span>
            </div>

            {/* Category sub-groups */}
            {catGroups.map(({ name, comps }) => {
              const catColor = CATEGORY_COLORS[name] || cl.sub;
              return (
                <div key={name} style={{ marginTop: 16, marginBottom: 20 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, fontFamily: font.heading, color: catColor,
                    }}>
                      {name}
                    </span>
                    <span style={{ fontSize: 10, color: cl.muted }}>{comps.length}</span>
                  </div>
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
                  }}>
                    {comps.map((comp: any) => (
                      <ComponentCard
                        key={comp.name}
                        comp={comp}
                        categoryColor={catColor}
                        onClick={() => setSelectedComp(comp)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Detail Dialog */}
      {selectedComp && (
        <ComponentDialog comp={selectedComp} onClose={() => setSelectedComp(null)} storybookAvailable={storybookAvailable} />
      )}
    </div>
  );
}

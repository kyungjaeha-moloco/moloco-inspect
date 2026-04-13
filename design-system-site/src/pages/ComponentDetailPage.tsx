import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ComponentsCatalog, ComponentEntry } from '../types';
import { slugify } from '../utils';
import { ComponentPreview } from '../components/ComponentPreview';
import { CopyButton } from '../components/CopyButton';

type Props = {
  catalog: ComponentsCatalog;
  stateMachines: any;
  behaviors: any;
};

function findComponent(catalog: ComponentsCatalog, slug: string): ComponentEntry | undefined {
  for (const cat of catalog.categories) {
    for (const comp of cat.components) {
      if (slugify(comp.name) === slug) return comp;
    }
  }
  return undefined;
}

/* ---- State Machine Lookup ---- */

function getStateMachineData(stateMachines: any, name: string): { states: Record<string, any>; description?: string; isPassive: boolean } | null {
  // Check passive first
  if (stateMachines.passive?.components?.includes(name)) {
    return { states: {}, isPassive: true };
  }

  // Check formInputs
  if (stateMachines.formInputs?.[name]) {
    const entry = stateMachines.formInputs[name];
    if (entry.states === 'none \u2014 pure layout component' || (!entry.extends && !entry.states && !entry.additional_states)) {
      return { states: {}, isPassive: true, description: entry.description };
    }
    if (entry.extends) {
      return resolveFormInputStates(stateMachines, name);
    }
    if (entry.states) {
      return { states: entry.states, description: entry.description, isPassive: false };
    }
  }

  // Check interactive
  if (stateMachines.interactive?.[name]) {
    return { states: stateMachines.interactive[name].states || {}, isPassive: false };
  }

  return null;
}

function resolveFormInputStates(stateMachines: any, name: string): { states: Record<string, any>; description?: string; isPassive: false } {
  const entry = stateMachines.formInputs[name];
  const extendsName = entry.extends;

  // Recursively resolve the base
  let baseStates: Record<string, any> = {};
  let description: string | undefined;
  if (extendsName === '_shared') {
    baseStates = JSON.parse(JSON.stringify(stateMachines.formInputs._shared.states || {}));
    description = stateMachines.formInputs._shared.description;
  } else if (stateMachines.formInputs[extendsName]) {
    const resolved = resolveFormInputStates(stateMachines, extendsName);
    baseStates = resolved.states;
  }

  // Merge additional_states
  if (entry.additional_states) {
    Object.assign(baseStates, entry.additional_states);
  }

  // Merge additional_transitions into existing states
  if (entry.additional_transitions) {
    for (const [stateName, transitions] of Object.entries(entry.additional_transitions as Record<string, any>)) {
      if (baseStates[stateName]?.transitions) {
        Object.assign(baseStates[stateName].transitions, transitions);
      }
    }
  }

  // Merge override_transitions into existing states
  if (entry.override_transitions) {
    for (const [stateName, transitions] of Object.entries(entry.override_transitions as Record<string, any>)) {
      if (baseStates[stateName]?.transitions) {
        Object.assign(baseStates[stateName].transitions, transitions);
      }
    }
  }

  return { states: baseStates, description, isPassive: false };
}

/* ---- Behavior Lookup ---- */

type BehaviorData = {
  semantic_actions: Array<{ action: string; triggers: string }>;
  data_flow: { input: string; output: string; side_effects: string[] };
};

function getBehaviorData(behaviors: any, name: string): BehaviorData | null {
  const categories = ['formInputs', 'buttons', 'navigation', 'feedback', 'display', 'table', 'layout', 'styled'];

  for (const cat of categories) {
    if (behaviors[cat]?.[name]) {
      const entry = behaviors[cat][name];
      return resolveBehavior(behaviors, cat, entry);
    }
  }
  return null;
}

function resolveBehavior(behaviors: any, category: string, entry: any): BehaviorData {
  if (!entry.extends) {
    return {
      semantic_actions: entry.semantic_actions || [],
      data_flow: entry.data_flow || { input: '', output: '', side_effects: [] },
    };
  }

  // Resolve base
  const baseName = entry.extends;
  let base: BehaviorData;
  if (baseName === '_shared') {
    const shared = behaviors[category]._shared;
    base = { semantic_actions: [...(shared.semantic_actions || [])], data_flow: { ...shared.data_flow } };
  } else if (behaviors[category]?.[baseName]) {
    base = resolveBehavior(behaviors, category, behaviors[category][baseName]);
    base = { semantic_actions: [...base.semantic_actions], data_flow: { ...base.data_flow } };
  } else {
    base = { semantic_actions: [], data_flow: { input: '', output: '', side_effects: [] } };
  }

  // Override actions replace base actions
  if (entry.override_actions) {
    base.semantic_actions = entry.override_actions;
  }

  // Additional actions append
  if (entry.additional_actions) {
    base.semantic_actions = [...base.semantic_actions, ...entry.additional_actions];
  }

  // Override data_flow if present
  if (entry.data_flow) {
    base.data_flow = entry.data_flow;
  }

  return base;
}

/* ---- Golden State Dot Color ---- */

function goldenStateDotColor(stateName: string): string {
  const lower = stateName.toLowerCase();
  if (lower === 'default' || lower === 'idle') return '#24a148';
  if (['hover', 'focus', 'active', 'selected', 'checked', 'on'].some(s => lower.includes(s))) return '#0f62fe';
  if (lower.includes('disabled') || lower.includes('readonly')) return '#8d8d8d';
  if (lower.includes('error')) return '#da1e28';
  if (lower.includes('loading') || lower.includes('submitting')) return '#f1c21b';
  return '#6f6f6f';
}

/* ---- Tabs ---- */

const TABS = ['Usage', 'Code', 'Style', 'States', 'Behavior', 'Accessibility', 'Notes'] as const;
type Tab = (typeof TABS)[number];

export function ComponentDetailPage({ catalog, stateMachines, behaviors }: Props) {
  const { slug } = useParams<{ slug: string }>();
  const comp = slug ? findComponent(catalog, slug) : undefined;
  const [activeTab, setActiveTab] = useState<Tab>('Usage');

  if (!comp) {
    return (
      <div className="empty-state">
        Component not found. <Link to="/components" className="link">Back to list</Link>
      </div>
    );
  }

  const smData = getStateMachineData(stateMachines, comp.name);
  const behaviorData = getBehaviorData(behaviors, comp.name);

  return (
    <>
      <div className="breadcrumbs">
        <Link to="/components">Components</Link>
        <span>/</span>
        <span>{comp.name}</span>
      </div>

      <div className="page-header">
        <h1 className="page-title">{comp.name}</h1>
        <p className="page-subtitle">{comp.description}</p>
      </div>

      {/* Live Preview */}
      <ComponentPreview component={comp} />

      <div className="stat-row">
        {comp.status && (
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{comp.status}</div>
            <div className="stat-label">Status</div>
          </div>
        )}
        {comp.tierName && (
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: '1rem' }}>{comp.tierName}</div>
            <div className="stat-label">Tier</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-value">{comp.propCount}</div>
          <div className="stat-label">Props</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{comp.goldenStates.length}</div>
          <div className="stat-label">States</div>
        </div>
        {comp.usageFileCount ? (
          <div className="stat-card">
            <div className="stat-value">{comp.usageFileCount}</div>
            <div className="stat-label">Files Using</div>
          </div>
        ) : null}
      </div>

      {/* Tab bar */}
      <div className="tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            className={`tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Usage' && <UsageTab comp={comp} />}
      {activeTab === 'Code' && <CodeTab comp={comp} />}
      {activeTab === 'Style' && <StyleTab comp={comp} />}
      {activeTab === 'States' && <StatesTab comp={comp} smData={smData} />}
      {activeTab === 'Behavior' && <BehaviorTab data={behaviorData} />}
      {activeTab === 'Accessibility' && <AccessibilityTab comp={comp} />}
      {activeTab === 'Notes' && <NotesTab comp={comp} />}
    </>
  );
}

/* ========== Usage Tab ========== */

function UsageTab({ comp }: { comp: ComponentEntry }) {
  return (
    <>
      {comp.importPath && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Import</h2>
          </div>
          <div style={{ position: 'relative' }}>
            <CopyButton text={`import ${comp.name} from '${comp.importPath}';`} />
            <div className="code-block">{`import ${comp.name} from '${comp.importPath}';`}</div>
          </div>
        </div>
      )}

      {comp.whenToUse && comp.whenToUse.length > 0 && (
        <div className="section">
          <div className="dodont-grid">
            <div className="dodont-card dodont-do">
              <div className="dodont-card-header">When to use</div>
              <div className="dodont-card-body">
                <ul>
                  {comp.whenToUse.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </div>
            </div>
            {comp.doNotUse && comp.doNotUse.length > 0 && (
              <div className="dodont-card dodont-dont">
                <div className="dodont-card-header">Do not use</div>
                <div className="dodont-card-body">
                  <ul>
                    {comp.doNotUse.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(comp.dos?.length || comp.donts?.length) ? (
        <div className="section">
          <h3 className="section-title">Implementation Guidelines</h3>
          <div className="dodont-grid">
            {comp.dos?.length ? (
              <div className="dodont-card dodont-do">
                <div className="dodont-card-header">✓ Do</div>
                <div className="dodont-card-body">
                  <ul>{comp.dos.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              </div>
            ) : null}
            {comp.donts?.length ? (
              <div className="dodont-card dodont-dont">
                <div className="dodont-card-header">✗ Don't</div>
                <div className="dodont-card-body">
                  <ul>{comp.donts.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {comp.antiPatterns?.length ? (
        <div className="section">
          <h3 className="section-title">Anti-patterns</h3>
          {comp.antiPatterns.map((ap, i) => (
            <div key={i} className="card" style={{ marginBottom: 8 }}>
              <div className="card-title">{ap.scenario}</div>
              <div className="card-desc">
                <strong>Why:</strong> {ap.reason}<br />
                <strong>Instead:</strong> <code>{ap.alternative}</code>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {(comp.requiredProviders.length > 0 || comp.mustBeInside.length > 0) && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Dependencies</h2>
          </div>
          {comp.requiredProviders.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <strong>Required providers:</strong>{' '}
              {comp.requiredProviders.map((p) => <code key={p} style={{ marginRight: 4 }}>{p}</code>)}
            </div>
          )}
          {comp.mustBeInside.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <strong>Must be inside:</strong>{' '}
              {comp.mustBeInside.map((p) => <code key={p} style={{ marginRight: 4 }}>{p}</code>)}
            </div>
          )}
          {comp.dependencyNotes && <p className="card-desc">{comp.dependencyNotes}</p>}
          {comp.commonlyPairedWith?.length ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-helper)', marginBottom: 4 }}>Commonly paired with</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {comp.commonlyPairedWith.map(c => <span key={c} className="badge badge-neutral">{c}</span>)}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

/* ========== Code Tab ========== */

function CodeTab({ comp }: { comp: ComponentEntry }) {
  return (
    <>
      {comp.example && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Example</h2>
          </div>
          <div className="code-block-header">JSX</div>
          <div style={{ position: 'relative' }}>
            <CopyButton text={comp.example} />
            <div className="code-block">{comp.example}</div>
          </div>
        </div>
      )}

      {comp.recipeCode && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Rendering Recipe</h2>
          </div>
          {comp.recipeDescription && <p className="card-desc" style={{ marginBottom: 12 }}>{comp.recipeDescription}</p>}
          <div style={{ position: 'relative' }}>
            <CopyButton text={comp.recipeCode} />
            <div className="code-block">{comp.recipeCode}</div>
          </div>
        </div>
      )}

      {!comp.example && !comp.recipeCode && (
        <div className="empty-state">No code examples available for this component.</div>
      )}
    </>
  );
}

/* ========== Style Tab ========== */

function StyleTab({ comp }: { comp: ComponentEntry }) {
  if (!comp.structure) {
    return <div className="empty-state">No style specifications available for this component.</div>;
  }

  const { dimensions, padding, spacing, border, background, notes } = comp.structure;

  const hasRecordSections = (dimensions && Object.keys(dimensions).length > 0) || (padding && Object.keys(padding).length > 0);
  const hasStringSections = spacing || border || background;

  return (
    <>
      {dimensions && Object.keys(dimensions).length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Dimensions</h2>
          </div>
          <table className="props-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(dimensions).map(([prop, value]) => (
                <tr key={prop}>
                  <td><code>{prop}</code></td>
                  <td><code>{value}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {padding && Object.keys(padding).length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Padding</h2>
          </div>
          <table className="props-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(padding).map(([prop, value]) => (
                <tr key={prop}>
                  <td><code>{prop}</code></td>
                  <td><code>{value}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {spacing && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Spacing</h2>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            <code>{spacing}</code>
          </div>
        </div>
      )}

      {border && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Border</h2>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            <code>{border}</code>
          </div>
        </div>
      )}

      {background && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Background</h2>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            <code>{background}</code>
          </div>
        </div>
      )}

      {notes && notes.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Layout Notes</h2>
          </div>
          <ul style={{ paddingLeft: 20, color: 'var(--text-secondary)' }}>
            {notes.map((note, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {!hasRecordSections && !hasStringSections && (
        <div className="empty-state">No dimensional specifications available.</div>
      )}
    </>
  );
}

/* ========== States Tab ========== */

function StatesTab({ comp, smData }: { comp: ComponentEntry; smData: ReturnType<typeof getStateMachineData> }) {
  return (
    <>
      {/* State Machine Diagram */}
      {smData && !smData.isPassive && Object.keys(smData.states).length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">State Machine</h2>
          </div>
          {smData.description && <p className="card-desc" style={{ marginBottom: 12 }}>{smData.description}</p>}
          <div className="state-flow">
            {Object.entries(smData.states).map(([stateName, stateData]: [string, any]) => (
              <div className="state-node" key={stateName}>
                <div className="state-node-name">
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: goldenStateDotColor(stateName) }} />
                  {stateName}
                </div>
                {stateData.visual && <div className="state-node-visual">{stateData.visual}</div>}
                {stateData.description && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 8 }}>{stateData.description}</div>}
                {stateData.transitions && Object.entries(stateData.transitions).map(([action, trans]: [string, any]) => (
                  <div className="state-transition" key={action}>
                    <span className="state-transition-action">{action}</span>
                    <span className="state-transition-target">{'\u2192'} {trans.target}</span>
                    {trans.trigger && <span className="state-transition-trigger">{trans.trigger}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Passive note */}
      {smData?.isPassive && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">State Machine</h2>
          </div>
          <div className="empty-state">
            This component is passive {'\u2014'} it renders based on props only, with no user-driven state transitions.
          </div>
        </div>
      )}

      {/* Golden States */}
      {comp.goldenStates.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Golden States</h2>
          </div>
          <div className="golden-state-grid">
            {comp.goldenStates.map((state) => (
              <div className="golden-state-card" key={state.name}>
                <div className="golden-state-name">
                  <span className="golden-state-dot" style={{ background: goldenStateDotColor(state.name) }} />
                  {state.name}
                </div>
                <div className="golden-state-desc">{state.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fallback if nothing at all */}
      {!smData && comp.goldenStates.length === 0 && (
        <div className="empty-state">No state information available for this component.</div>
      )}
    </>
  );
}

/* ========== Behavior Tab ========== */

function BehaviorTab({ data }: { data: BehaviorData | null }) {
  if (!data) {
    return <div className="empty-state">No behavior data available for this component.</div>;
  }

  return (
    <>
      {data.semantic_actions.length > 0 && (
        <div className="section behavior-section">
          <div className="section-header">
            <h2 className="section-title">Semantic Actions</h2>
          </div>
          {data.semantic_actions.map((sa, i) => (
            <div className="behavior-action" key={i}>
              <div className="behavior-action-name">{sa.action}</div>
              <div className="behavior-action-trigger">{sa.triggers}</div>
            </div>
          ))}
        </div>
      )}

      {data.data_flow && (
        <div className="section behavior-section">
          <div className="section-header">
            <h2 className="section-title">Data Flow</h2>
          </div>
          <div className="data-flow-grid">
            <div className="data-flow-card">
              <div className="data-flow-label">Input</div>
              <div className="data-flow-value">{data.data_flow.input || 'None'}</div>
            </div>
            <div className="data-flow-card">
              <div className="data-flow-label">Output</div>
              <div className="data-flow-value">{data.data_flow.output || 'None'}</div>
            </div>
            <div className="data-flow-card">
              <div className="data-flow-label">Side Effects</div>
              <div className="data-flow-value">
                {data.data_flow.side_effects && data.data_flow.side_effects.length > 0
                  ? data.data_flow.side_effects.join(', ')
                  : 'None'}
              </div>
            </div>
          </div>
        </div>
      )}

      {data.semantic_actions.length === 0 && !data.data_flow && (
        <div className="empty-state">No behavior data available for this component.</div>
      )}
    </>
  );
}

/* ========== Accessibility Tab ========== */

function AccessibilityTab({ comp }: { comp: ComponentEntry }) {
  if (!comp.accessibility) {
    return <div className="empty-state">No accessibility documentation available for this component.</div>;
  }

  const a11y = comp.accessibility;

  return (
    <>
      {(a11y.role || a11y.ariaLabel) && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">ARIA Attributes</h2>
          </div>
          {a11y.role && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>ARIA Role: </span>
              <code>{a11y.role}</code>
            </div>
          )}
          {a11y.ariaLabel && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>ARIA Label: </span>
              <code>{a11y.ariaLabel}</code>
            </div>
          )}
        </div>
      )}

      {a11y.keyboardInteraction?.length ? (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Keyboard Interaction</h2>
          </div>
          <table className="props-table">
            <thead><tr><th>Key</th><th>Action</th></tr></thead>
            <tbody>
              {a11y.keyboardInteraction.map((ki: any, i: number) => (
                <tr key={i}><td><code>{ki.key}</code></td><td>{ki.action}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {a11y.screenReaderAnnouncement && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Screen Reader</h2>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {a11y.screenReaderAnnouncement}
          </div>
        </div>
      )}

      {a11y.notes?.length ? (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Accessibility Notes</h2>
          </div>
          <ul style={{ paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {a11y.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/* ========== Notes Tab ========== */

function NotesTab({ comp }: { comp: ComponentEntry }) {
  const hasNotes = comp.notes && comp.notes.length > 0;

  if (!hasNotes) {
    return <div className="empty-state">No notes available for this component.</div>;
  }

  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">Notes</h2>
      </div>
      <ul style={{ paddingLeft: 20, color: 'var(--text-secondary)' }}>
        {comp.notes!.map((note, i) => <li key={i} style={{ marginBottom: 4 }}>{note}</li>)}
      </ul>
    </div>
  );
}

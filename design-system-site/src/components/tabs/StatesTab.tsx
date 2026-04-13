import React from 'react';
import type { ComponentEntry } from '../../types';

type StateData = { visual?: string; description?: string; transitions?: Record<string, { target: string; trigger?: string }> };

export function goldenStateDotColor(stateName: string): string {
  const lower = stateName.toLowerCase();
  if (lower === 'default' || lower === 'idle') return '#24a148';
  if (['hover', 'focus', 'active', 'selected', 'checked', 'on'].some(s => lower.includes(s))) return '#0f62fe';
  if (lower.includes('disabled') || lower.includes('readonly')) return '#8d8d8d';
  if (lower.includes('error')) return '#da1e28';
  if (lower.includes('loading') || lower.includes('submitting')) return '#f1c21b';
  return '#6f6f6f';
}

type SmData = { states: Record<string, StateData>; description?: string; isPassive: boolean } | null;

export function StatesTab({ comp, smData }: { comp: ComponentEntry; smData: SmData }) {
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
            {Object.entries(smData.states).map(([stateName, stateData]) => (
              <div className="state-node" key={stateName}>
                <div className="state-node-name">
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: goldenStateDotColor(stateName) }} />
                  {stateName}
                </div>
                {stateData.visual && <div className="state-node-visual">{stateData.visual}</div>}
                {stateData.description && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 8 }}>{stateData.description}</div>}
                {stateData.transitions && Object.entries(stateData.transitions).map(([action, trans]) => (
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

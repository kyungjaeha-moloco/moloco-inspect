import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ComponentsCatalog, ComponentEntry, StateMachinesJson, ComponentBehaviorsJson } from '../types';
import { slugify } from '../utils';
import { ComponentPreview } from '../components/ComponentPreview';
import { useComponentControls, PropControlsPanel } from '../components/PropControls';
import {
  UsageTab,
  CodeTab,
  StyleTab,
  StatesTab,
  BehaviorTab,
  AccessibilityTab,
  NotesTab,
} from '../components/tabs';
import type { BehaviorData } from '../components/tabs';

type Props = {
  catalog: ComponentsCatalog;
  stateMachines: StateMachinesJson;
  behaviors: ComponentBehaviorsJson;
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

type StateData = { visual?: string; description?: string; transitions?: Record<string, { target: string; trigger?: string }> };

function getStateMachineData(stateMachines: StateMachinesJson, name: string): { states: Record<string, StateData>; description?: string; isPassive: boolean } | null {
  if (stateMachines.passive?.components?.includes(name)) {
    return { states: {}, isPassive: true };
  }

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

  if (stateMachines.interactive?.[name]) {
    return { states: stateMachines.interactive[name].states || {}, isPassive: false };
  }

  return null;
}

function resolveFormInputStates(stateMachines: StateMachinesJson, name: string): { states: Record<string, StateData>; description?: string; isPassive: false } {
  const entry = stateMachines.formInputs![name];
  const extendsName = entry.extends;

  let baseStates: Record<string, StateData> = {};
  let description: string | undefined;
  if (extendsName === '_shared') {
    baseStates = JSON.parse(JSON.stringify(stateMachines.formInputs!._shared.states || {}));
    description = stateMachines.formInputs!._shared.description;
  } else if (stateMachines.formInputs![extendsName]) {
    const resolved = resolveFormInputStates(stateMachines, extendsName);
    baseStates = resolved.states;
  }

  if (entry.additional_states) {
    Object.assign(baseStates, entry.additional_states);
  }

  if (entry.additional_transitions) {
    for (const [stateName, transitions] of Object.entries(entry.additional_transitions as Record<string, Record<string, { target: string; trigger?: string }>>)) {
      if (baseStates[stateName]?.transitions) {
        Object.assign(baseStates[stateName].transitions, transitions);
      }
    }
  }

  if (entry.override_transitions) {
    for (const [stateName, transitions] of Object.entries(entry.override_transitions as Record<string, Record<string, { target: string; trigger?: string }>>)) {
      if (baseStates[stateName]?.transitions) {
        Object.assign(baseStates[stateName].transitions, transitions);
      }
    }
  }

  return { states: baseStates, description, isPassive: false };
}

/* ---- Behavior Lookup ---- */

function getBehaviorData(behaviors: ComponentBehaviorsJson, name: string): BehaviorData | null {
  const categories = ['formInputs', 'buttons', 'navigation', 'feedback', 'display', 'table', 'layout', 'styled'];

  for (const cat of categories) {
    if (behaviors[cat]?.[name]) {
      const entry = behaviors[cat][name];
      return resolveBehavior(behaviors, cat, entry);
    }
  }
  return null;
}

type BehaviorEntry = ComponentBehaviorsJson[string][string];

function resolveBehavior(behaviors: ComponentBehaviorsJson, category: string, entry: BehaviorEntry): BehaviorData {
  if (!entry.extends) {
    return {
      semantic_actions: entry.semantic_actions || [],
      data_flow: entry.data_flow || { input: '', output: '', side_effects: [] },
    };
  }

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

  if (entry.override_actions) {
    base.semantic_actions = entry.override_actions;
  }

  if (entry.additional_actions) {
    base.semantic_actions = [...base.semantic_actions, ...entry.additional_actions];
  }

  if (entry.data_flow) {
    base.data_flow = entry.data_flow;
  }

  return base;
}

/* ---- Tab bar ---- */

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
  const { controls, values, setValue } = useComponentControls(comp.name);

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

      {/* Live Preview with Controls */}
      <div className="preview-with-controls">
        {controls.length > 0 && (
          <PropControlsPanel controls={controls} values={values} setValue={setValue} />
        )}
        <ComponentPreview component={comp} propValues={values} />
      </div>

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

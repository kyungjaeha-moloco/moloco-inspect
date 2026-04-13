import React from 'react';
import type { ComponentEntry } from '../types';
import type { PropValues } from './PropControls';
import {
  ButtonPreview,
  TextInputPreview,
  TextAreaPreview,
  NumberInputPreview,
  CheckBoxPreview,
  SwitchPreview,
  RadioPreview,
  TabsPreview,
  AccordionPreview,
  DialogPreview,
  SelectPreview,
  SearchBarPreview,
  StatusPreview,
  BannerPreview,
  LoaderPreview,
} from './previews';

/* ------------------------------------------------------------------ */
/*  Static previews (for components that don't need interaction)       */
/* ------------------------------------------------------------------ */

const STATIC_PREVIEWS: Record<string, React.ReactNode> = {
  MCStatusBadge: (
    <div className="preview-status-row">
      <div className="preview-pill active">Active</div>
      <div className="preview-pill muted">Paused</div>
    </div>
  ),
  MCContentLayout: (
    <div className="preview-layout-shell">
      <div className="preview-layout-header">
        <div>
          <div className="preview-breadcrumb-mock">Campaign / List</div>
          <div className="preview-layout-title">Campaign overview</div>
        </div>
        <div className="preview-button primary">Create</div>
      </div>
      <div className="preview-tabs-mock">
        <div className="preview-tab-mock active">Available</div>
        <div className="preview-tab-mock">Archived</div>
      </div>
      <div className="preview-panel" />
    </div>
  ),
  MCI18nTable: (
    <div className="preview-table-mock">
      <div className="preview-table-head-mock">
        <span>Metric</span><span>Status</span><span>Value</span>
      </div>
      <div className="preview-table-row-mock">
        <span>CTR</span><span>Healthy</span><span>2.3%</span>
      </div>
      <div className="preview-table-row-mock">
        <span>Spend</span><span>Warning</span><span>$2,310</span>
      </div>
    </div>
  ),
  MCTableActionBar: (
    <div className="preview-actionbar">
      <div className="preview-counter">24 selected</div>
      <div className="preview-button-row">
        <div className="preview-button secondary">Export</div>
        <div className="preview-button primary">Apply action</div>
      </div>
    </div>
  ),
  MCFormLayout: (
    <div className="preview-layout-shell">
      <div className="preview-breadcrumb-mock">Order / New order</div>
      <div className="preview-panel">
        <div className="preview-layout-title" style={{ fontSize: 14 }}>Full page form</div>
        <div className="preview-mini-note">Header, body panel, footer actions</div>
      </div>
    </div>
  ),
  MCColorPicker: (
    <div className="preview-color-picker">
      <div className="preview-color-trigger">
        <div className="preview-color-swatch" />
        <strong>#346BEA</strong>
      </div>
    </div>
  ),
  MCFormDatePicker: (
    <div className="preview-input-shell" style={{ maxWidth: 240 }}>
      <div className="preview-input-label">Start date</div>
      <div className="preview-input" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>2026-04-12</span>
        <span style={{ fontSize: 13, color: '#8d8d8d' }}>📅</span>
      </div>
    </div>
  ),
  MCFormTimePicker: (
    <div className="preview-input-shell" style={{ maxWidth: 200 }}>
      <div className="preview-input-label">Delivery time</div>
      <div className="preview-input" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>09:00 AM</span>
        <span style={{ fontSize: 13, color: '#8d8d8d' }}>🕐</span>
      </div>
    </div>
  ),
  MCFormTagInput: (
    <div className="preview-input-shell" style={{ maxWidth: 320 }}>
      <div className="preview-input-label">Keywords</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '6px 10px', border: '1px solid #c6c6c6', borderRadius: 4, background: '#fff', alignItems: 'center' }}>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: '#E3F2FD', color: '#0f62fe' }}>retargeting</span>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: '#E3F2FD', color: '#0f62fe' }}>performance</span>
        <span style={{ fontSize: 12, color: '#8d8d8d' }}>Type to add...</span>
      </div>
    </div>
  ),
  MCFormMultiRichSelect: (
    <div className="preview-input-shell" style={{ maxWidth: 320 }}>
      <div className="preview-input-label">Target regions</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '6px 10px', border: '1px solid #c6c6c6', borderRadius: 4, background: '#fff' }}>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: '#e0e0e0' }}>US</span>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: '#e0e0e0' }}>KR</span>
        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: '#e0e0e0' }}>JP</span>
      </div>
    </div>
  ),
  MCDivider: (
    <div style={{ width: '100%', maxWidth: 300 }}>
      <div style={{ fontSize: 13, color: '#161616', marginBottom: 8 }}>Section A content</div>
      <hr style={{ border: 'none', borderTop: '1px solid #e0e0e0', margin: '8px 0' }} />
      <div style={{ fontSize: 13, color: '#161616', marginTop: 8 }}>Section B content</div>
    </div>
  ),
  MCStepper: (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#24a148', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✓</div>
      <div style={{ width: 40, height: 2, background: '#24a148' }} />
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0f62fe', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>2</div>
      <div style={{ width: 40, height: 2, background: '#e0e0e0' }} />
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e0e0e0', color: '#525252', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>3</div>
    </div>
  ),
  MCTimer: (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#8d8d8d' }}>⏱</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 600, color: '#161616' }}>02:34:56</span>
    </div>
  ),
  MCMoreActionsButton: (
    <div style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: '#525252' }}>⋮</div>
  ),
  MCTag: (
    <div style={{ display: 'flex', gap: 6 }}>
      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: '#E3F2FD', color: '#0f62fe', fontWeight: 500 }}>Active</span>
      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: '#E8F5E9', color: '#24a148', fontWeight: 500 }}>Approved</span>
      <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: '#e0e0e0', color: '#525252', fontWeight: 500 }}>Draft</span>
    </div>
  ),
  MCEmpty: (
    <div style={{ textAlign: 'center', padding: '24px 16px' }}>
      <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>📭</div>
      <div style={{ fontSize: 14, color: '#161616', fontWeight: 500 }}>No data available</div>
      <div style={{ fontSize: 13, color: '#8d8d8d', marginTop: 4 }}>Try adjusting your filters</div>
    </div>
  ),
  MCIcon: (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <span style={{ fontSize: 20, color: '#161616' }}>✎</span>
      <span style={{ fontSize: 20, color: '#0f62fe' }}>⚙</span>
      <span style={{ fontSize: 20, color: '#24a148' }}>✓</span>
      <span style={{ fontSize: 20, color: '#da1e28' }}>✕</span>
      <span style={{ fontSize: 20, color: '#8d8d8d' }}>⊘</span>
    </div>
  ),
  MCPopover: (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div className="preview-button secondary">Options ▾</div>
      <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 6, padding: '4px 0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', minWidth: 140, zIndex: 1 }}>
        <div style={{ padding: '6px 12px', fontSize: 13, color: '#161616' }}>Edit</div>
        <div style={{ padding: '6px 12px', fontSize: 13, color: '#161616' }}>Duplicate</div>
        <div style={{ padding: '6px 12px', fontSize: 13, color: '#da1e28' }}>Delete</div>
      </div>
    </div>
  ),
};

/* ------------------------------------------------------------------ */
/*  Interactive preview map (component name → React component)         */
/* ------------------------------------------------------------------ */

const INTERACTIVE_PREVIEWS: Record<string, React.FC<{ propValues?: PropValues }>> = {
  MCButton2: ButtonPreview,
  MCFormTextInput: TextInputPreview,
  MCFormTextArea: TextAreaPreview,
  MCFormNumberInput: NumberInputPreview,
  MCFormCheckBox: CheckBoxPreview,
  MCFormSwitchInput: SwitchPreview,
  MCFormRadioGroup: RadioPreview,
  MCRadioGroup: RadioPreview,
  MCBarTabs: TabsPreview,
  MCAccordion: AccordionPreview,
  MCCommonDialog: DialogPreview,
  MCFormSingleRichSelect: SelectPreview,
  MCSearchBar: SearchBarPreview,
  MCStatus: StatusPreview,
  MCBanner: BannerPreview,
  MCLoader: LoaderPreview,
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ComponentPreview({ component, propValues }: { component: ComponentEntry; propValues?: PropValues }) {
  const name = component.name;
  const category = component.functionalCategory;

  // 1. Try interactive preview
  const Interactive = INTERACTIVE_PREVIEWS[name];
  if (Interactive) return <div className="preview-frame"><Interactive propValues={propValues} /></div>;

  // 2. Try static named preview
  if (STATIC_PREVIEWS[name]) return <div className="preview-frame">{STATIC_PREVIEWS[name]}</div>;

  // 3. Generic fallback by category
  if (category === 'input') return (
    <div className="preview-frame">
      <div className="preview-input-shell">
        <div className="preview-input-label">Field label</div>
        <div className="preview-input">Type a value</div>
        <div className="preview-input-hint">Helper description</div>
      </div>
    </div>
  );
  if (category === 'layout') return (
    <div className="preview-frame">
      <div className="preview-layout-shell">
        <div className="preview-layout-header">
          <div>
            <div className="preview-breadcrumb-mock">Section / Group</div>
            <div className="preview-layout-title">Layout title</div>
          </div>
          <div className="preview-button primary">Action</div>
        </div>
        <div className="preview-panel" />
      </div>
    </div>
  );
  if (category === 'display') return (
    <div className="preview-frame">
      <div className="preview-status-row">
        <div className="preview-pill muted">{name}</div>
      </div>
    </div>
  );
  if (category === 'navigation') return (
    <div className="preview-frame">
      <div className="preview-tabs-mock">
        <div className="preview-tab-mock active">Section</div>
        <div className="preview-tab-mock">Menu</div>
      </div>
    </div>
  );

  return (
    <div className="preview-frame">
      <div className="preview-placeholder">
        <span className="preview-mini-note">{name}</span>
      </div>
    </div>
  );
}

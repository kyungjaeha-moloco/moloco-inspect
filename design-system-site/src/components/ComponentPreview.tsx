import React, { useState } from 'react';
import type { ComponentEntry } from '../types';

/* ------------------------------------------------------------------ */
/*  Interactive preview sub-components                                 */
/* ------------------------------------------------------------------ */

function ButtonPreview() {
  const [clicked, setClicked] = useState<string | null>(null);
  return (
    <div className="preview-button-row">
      {['Create campaign', 'Cancel', 'More'].map((label, i) => {
        const variant = i === 0 ? 'primary' : i === 1 ? 'secondary' : 'ghost';
        return (
          <div
            key={label}
            className={`preview-button ${variant}${clicked === label ? ' preview-button-pressed' : ''}`}
            onClick={() => { setClicked(label); setTimeout(() => setClicked(null), 300); }}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {clicked === label ? '✓ Clicked' : label}
          </div>
        );
      })}
    </div>
  );
}

function TextInputPreview() {
  const [value, setValue] = useState('Brand awareness launch');
  const [focused, setFocused] = useState(false);
  return (
    <div className="preview-input-shell">
      <div className="preview-input-label">Campaign title</div>
      <input
        className={`preview-input-live${focused ? ' focused' : ''}`}
        value={value}
        onChange={e => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Enter campaign title"
      />
      <div className="preview-input-hint">Used as the internal display name</div>
    </div>
  );
}

function TextAreaPreview() {
  const [value, setValue] = useState('Add a short summary for stakeholders.');
  const [focused, setFocused] = useState(false);
  return (
    <div className="preview-input-shell">
      <div className="preview-input-label">Description</div>
      <textarea
        className={`preview-textarea-live${focused ? ' focused' : ''}`}
        value={value}
        onChange={e => setValue(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={3}
      />
    </div>
  );
}

function NumberInputPreview() {
  const [value, setValue] = useState(1500);
  const [focused, setFocused] = useState(false);
  return (
    <div className="preview-input-shell">
      <div className="preview-input-label">Daily budget ($)</div>
      <input
        type="number"
        className={`preview-input-live${focused ? ' focused' : ''}`}
        value={value}
        onChange={e => setValue(Number(e.target.value))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <div className="preview-input-hint">Minimum $100</div>
    </div>
  );
}

function CheckBoxPreview() {
  const [checks, setChecks] = useState([true, false]);
  const labels = ['Include remarketing users', 'Exclude existing customers'];
  return (
    <div className="preview-checkbox-shell">
      {labels.map((label, i) => (
        <div
          key={label}
          className="preview-checkbox-option"
          onClick={() => { const next = [...checks]; next[i] = !next[i]; setChecks(next); }}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <div className={`preview-checkbox-box${checks[i] ? ' checked' : ''}`}>
            {checks[i] ? '✓' : ''}
          </div>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function SwitchPreview() {
  const [on, setOn] = useState(true);
  return (
    <div className="preview-inline-row">
      <span className="preview-input-label">Live delivery enabled</span>
      <div
        className={`preview-switch${on ? ' on' : ''}`}
        onClick={() => setOn(!on)}
        style={{ cursor: 'pointer' }}
      >
        <div className="preview-switch-knob" />
      </div>
    </div>
  );
}

function RadioPreview() {
  const [selected, setSelected] = useState(0);
  const options = ['CPC', 'CPM', 'CPA'];
  return (
    <div className="preview-radio-shell">
      {options.map((opt, i) => (
        <div
          key={opt}
          className="preview-radio-option"
          onClick={() => setSelected(i)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <div className={`preview-radio-dot${selected === i ? ' active' : ''}`} />
          <span>{opt}</span>
        </div>
      ))}
    </div>
  );
}

function TabsPreview() {
  const [active, setActive] = useState(0);
  const tabs = ['Overview', 'Creative', 'Settings'];
  return (
    <div>
      <div className="preview-tabs-mock">
        {tabs.map((tab, i) => (
          <div
            key={tab}
            className={`preview-tab-mock${active === i ? ' active' : ''}`}
            onClick={() => setActive(i)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {tab}
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 0', fontSize: 13, color: '#525252' }}>
        {tabs[active]} tab content
      </div>
    </div>
  );
}

function AccordionPreview() {
  const [open, setOpen] = useState(true);
  return (
    <div className="preview-layout-shell">
      <div
        className="preview-accordion-item"
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <div className="preview-inline-row">
          <strong>Advanced settings</strong>
          <span className="preview-mini-note">{open ? 'Collapse ▴' : 'Expand ▾'}</span>
        </div>
      </div>
      {open && <div className="preview-panel" style={{ height: 40 }} />}
    </div>
  );
}

function DialogPreview() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <div
        className="preview-button primary"
        onClick={() => setOpen(true)}
        style={{ cursor: 'pointer' }}
      >
        Open dialog
      </div>
    );
  }
  return (
    <div className="preview-dialog-shell">
      <div className="preview-dialog-title">Delete creative</div>
      <div className="preview-dialog-copy">This action cannot be undone.</div>
      <div className="preview-button-row">
        <div
          className="preview-button secondary"
          onClick={() => setOpen(false)}
          style={{ cursor: 'pointer' }}
        >
          Cancel
        </div>
        <div
          className="preview-button primary"
          onClick={() => setOpen(false)}
          style={{ cursor: 'pointer' }}
        >
          Delete
        </div>
      </div>
    </div>
  );
}

function SelectPreview() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('Performance');
  const options = ['Performance', 'Brand Awareness', 'Retargeting'];
  return (
    <div className="preview-input-shell" style={{ maxWidth: 280, position: 'relative' }}>
      <div className="preview-input-label">Campaign type</div>
      <div
        className="preview-input"
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <span>{selected}</span>
        <span style={{ fontSize: 11, color: '#8d8d8d' }}>{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, background: '#fff', border: '1px solid #c6c6c6', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => { setSelected(opt); setOpen(false); }}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', background: opt === selected ? '#E3F2FD' : 'transparent' }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchBarPreview() {
  const [value, setValue] = useState('');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid #c6c6c6', borderRadius: 6, background: '#fff', minWidth: 260 }}>
      <span style={{ fontSize: 14, color: '#8d8d8d' }}>🔍</span>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Search campaigns..."
        style={{ border: 'none', outline: 'none', fontSize: 14, color: '#161616', background: 'transparent', flex: 1 }}
      />
      {value && (
        <span
          onClick={() => setValue('')}
          style={{ fontSize: 12, color: '#8d8d8d', cursor: 'pointer' }}
        >✕</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Static previews (for components that don't need interaction)       */
/* ------------------------------------------------------------------ */

const STATIC_PREVIEWS: Record<string, React.ReactNode> = {
  MCStatus: (
    <div className="preview-status-row">
      <div className="preview-pill active">Healthy</div>
      <div className="preview-pill warning">Pending</div>
      <div className="preview-pill error">Rejected</div>
    </div>
  ),
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
  MCLoader: (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div className="preview-spinner" />
      <span style={{ fontSize: 12, color: '#8d8d8d' }}>Loading...</span>
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
  MCBanner: (
    <div style={{ padding: '12px 16px', background: '#E1F5FE', borderLeft: '3px solid #0288D1', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8, minWidth: 300 }}>
      <span style={{ fontSize: 14 }}>ℹ</span>
      <span style={{ fontSize: 13, color: '#161616' }}>Your campaign is under review.</span>
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

const INTERACTIVE_PREVIEWS: Record<string, React.FC> = {
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
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ComponentPreview({ component }: { component: ComponentEntry }) {
  const name = component.name;
  const category = component.functionalCategory;

  // 1. Try interactive preview
  const Interactive = INTERACTIVE_PREVIEWS[name];
  if (Interactive) return <div className="preview-frame"><Interactive /></div>;

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

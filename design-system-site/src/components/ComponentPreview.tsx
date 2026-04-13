import React, { useState } from 'react';
import type { ComponentEntry } from '../types';
import type { PropValues } from './PropControls';

/* ------------------------------------------------------------------ */
/*  Interactive preview sub-components                                 */
/* ------------------------------------------------------------------ */

function ButtonPreview({ propValues }: { propValues?: PropValues }) {
  const [clicked, setClicked] = useState<string | null>(null);
  const variant = String(propValues?.variant || 'contained');
  const size = String(propValues?.size || 'medium');
  const disabled = Boolean(propValues?.disabled);
  const loading = Boolean(propValues?.loading);

  const sizeStyles: Record<string, React.CSSProperties> = {
    small: { padding: '4px 12px', fontSize: 12 },
    medium: { padding: '8px 16px', fontSize: 13 },
    large: { padding: '12px 24px', fontSize: 15 },
  };

  const variantClass = variant === 'contained' ? 'primary' : variant === 'outlined' ? 'secondary' : 'ghost';

  return (
    <div className="preview-button-row">
      <div
        className={`preview-button ${variantClass}${clicked ? ' preview-button-pressed' : ''}`}
        onClick={() => {
          if (disabled || loading) return;
          setClicked('yes'); setTimeout(() => setClicked(null), 300);
        }}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          opacity: disabled ? 0.4 : 1,
          ...sizeStyles[size],
        }}
      >
        {loading ? 'Loading...' : clicked ? '✓ Clicked' : 'Create campaign'}
      </div>
      <div
        className="preview-button secondary"
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          opacity: disabled ? 0.4 : 1,
          ...sizeStyles[size],
        }}
      >
        Cancel
      </div>
    </div>
  );
}

function TextInputPreview({ propValues }: { propValues?: PropValues }) {
  const [value, setValue] = useState('Brand awareness launch');
  const [focused, setFocused] = useState(false);
  const state = String(propValues?.state || 'default');
  const required = Boolean(propValues?.required);

  const isDisabled = state === 'disabled';
  const isReadonly = state === 'readonly';
  const isError = state === 'error';
  const isFocused = state === 'focused' || focused;

  const borderColor = isError ? '#da1e28' : isFocused ? '#0f62fe' : '#c6c6c6';

  return (
    <div className="preview-input-shell">
      <div className="preview-input-label">
        Campaign title{required && <span style={{ color: '#da1e28', marginLeft: 2 }}>*</span>}
      </div>
      <input
        className={`preview-input-live${isFocused ? ' focused' : ''}`}
        value={value}
        onChange={e => { if (!isDisabled && !isReadonly) setValue(e.target.value); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Enter campaign title"
        disabled={isDisabled}
        readOnly={isReadonly}
        style={{
          borderColor,
          background: isDisabled ? '#f4f4f4' : isReadonly ? '#f9f9f9' : '#fff',
          color: isDisabled ? '#8d8d8d' : '#161616',
          cursor: isDisabled ? 'not-allowed' : isReadonly ? 'default' : 'text',
        }}
      />
      {isError ? (
        <div className="preview-input-hint" style={{ color: '#da1e28' }}>This field is required</div>
      ) : (
        <div className="preview-input-hint">Used as the internal display name</div>
      )}
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

function CheckBoxPreview({ propValues }: { propValues?: PropValues }) {
  const controlledChecked = propValues?.checked !== undefined ? Boolean(propValues.checked) : undefined;
  const disabled = Boolean(propValues?.disabled);
  const [checks, setChecks] = useState([true, false]);
  const labels = ['Include remarketing users', 'Exclude existing customers'];

  const effectiveChecks = controlledChecked !== undefined ? [controlledChecked, controlledChecked] : checks;

  return (
    <div className="preview-checkbox-shell">
      {labels.map((label, i) => (
        <div
          key={label}
          className="preview-checkbox-option"
          onClick={() => {
            if (disabled) return;
            if (controlledChecked === undefined) {
              const next = [...checks]; next[i] = !next[i]; setChecks(next);
            }
          }}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none', opacity: disabled ? 0.4 : 1 }}
        >
          <div className={`preview-checkbox-box${effectiveChecks[i] ? ' checked' : ''}`}>
            {effectiveChecks[i] ? '✓' : ''}
          </div>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function SwitchPreview({ propValues }: { propValues?: PropValues }) {
  const controlledOn = propValues?.on !== undefined ? Boolean(propValues.on) : undefined;
  const disabled = Boolean(propValues?.disabled);
  const [on, setOn] = useState(true);
  const isOn = controlledOn !== undefined ? controlledOn : on;

  return (
    <div className="preview-inline-row">
      <span className="preview-input-label">Live delivery enabled</span>
      <div
        className={`preview-switch${isOn ? ' on' : ''}`}
        onClick={() => { if (!disabled && controlledOn === undefined) setOn(!on); }}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}
      >
        <div className="preview-switch-knob" />
      </div>
    </div>
  );
}

function RadioPreview({ propValues }: { propValues?: PropValues }) {
  const disabled = Boolean(propValues?.disabled);
  const [selected, setSelected] = useState(0);
  const options = ['CPC', 'CPM', 'CPA'];
  return (
    <div className="preview-radio-shell">
      {options.map((opt, i) => (
        <div
          key={opt}
          className="preview-radio-option"
          onClick={() => { if (!disabled) setSelected(i); }}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none', opacity: disabled ? 0.4 : 1 }}
        >
          <div className={`preview-radio-dot${selected === i ? ' active' : ''}`} />
          <span>{opt}</span>
        </div>
      ))}
    </div>
  );
}

function TabsPreview({ propValues }: { propValues?: PropValues }) {
  const [active, setActive] = useState(0);
  const variant = String(propValues?.variant || 'default');
  const tabs = ['Overview', 'Creative', 'Settings'];
  const isContained = variant === 'contained';
  return (
    <div>
      <div className="preview-tabs-mock" style={isContained ? { background: '#f4f4f4', borderRadius: 8, padding: 4, border: 'none' } : undefined}>
        {tabs.map((tab, i) => (
          <div
            key={tab}
            className={`preview-tab-mock${active === i ? ' active' : ''}`}
            onClick={() => setActive(i)}
            style={{
              cursor: 'pointer', userSelect: 'none',
              ...(isContained && active === i ? { background: '#fff', borderRadius: 6, borderBottom: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : {}),
              ...(isContained && active !== i ? { borderBottom: 'none' } : {}),
            }}
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

function DialogPreview({ propValues }: { propValues?: PropValues }) {
  const [open, setOpen] = useState(true);
  const variant = String(propValues?.variant || 'default');
  const isDestructive = variant === 'destructive';

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
      <div className="preview-dialog-title">{isDestructive ? 'Delete creative' : 'Confirm action'}</div>
      <div className="preview-dialog-copy">{isDestructive ? 'This action cannot be undone.' : 'Are you sure you want to proceed?'}</div>
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
          style={{ cursor: 'pointer', background: isDestructive ? '#da1e28' : undefined }}
        >
          {isDestructive ? 'Delete' : 'Confirm'}
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
/*  Prop-controlled preview sub-components (formerly static)           */
/* ------------------------------------------------------------------ */

function StatusPreview({ propValues }: { propValues?: PropValues }) {
  const variant = String(propValues?.variant || 'positive');
  const variantMap: Record<string, { className: string; label: string }> = {
    positive: { className: 'active', label: 'Healthy' },
    warning: { className: 'warning', label: 'Pending' },
    negative: { className: 'error', label: 'Rejected' },
    neutral: { className: 'muted', label: 'Inactive' },
  };
  const current = variantMap[variant] || variantMap.positive;
  return (
    <div className="preview-status-row">
      <div className={`preview-pill ${current.className}`}>{current.label}</div>
    </div>
  );
}

function BannerPreview({ propValues }: { propValues?: PropValues }) {
  const variant = String(propValues?.variant || 'info');
  const variantMap: Record<string, { bg: string; border: string; icon: string; text: string }> = {
    info: { bg: '#E1F5FE', border: '#0288D1', icon: '\u2139', text: 'Your campaign is under review.' },
    success: { bg: '#E8F5E9', border: '#24a148', icon: '\u2713', text: 'Campaign published successfully.' },
    warning: { bg: '#FFF8E1', border: '#f1c21b', icon: '\u26A0', text: 'Budget is running low.' },
    error: { bg: '#FFEBEE', border: '#da1e28', icon: '\u2717', text: 'Campaign delivery failed.' },
  };
  const current = variantMap[variant] || variantMap.info;
  return (
    <div style={{ padding: '12px 16px', background: current.bg, borderLeft: `3px solid ${current.border}`, borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8, minWidth: 300 }}>
      <span style={{ fontSize: 14 }}>{current.icon}</span>
      <span style={{ fontSize: 13, color: '#161616' }}>{current.text}</span>
    </div>
  );
}

function LoaderPreview({ propValues }: { propValues?: PropValues }) {
  const size = String(propValues?.size || 'medium');
  const sizeMap: Record<string, number> = { small: 20, medium: 32, large: 48 };
  const px = sizeMap[size] || 32;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div className="preview-spinner" style={{ width: px, height: px }} />
      <span style={{ fontSize: 12, color: '#8d8d8d' }}>Loading...</span>
    </div>
  );
}

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

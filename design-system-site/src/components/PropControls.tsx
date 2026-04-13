import React from 'react';

type PropControlValue = string | boolean;
type PropValues = Record<string, PropControlValue>;

type ControlDef = {
  prop: string;
  label: string;
  type: 'select' | 'toggle';
  options?: string[];
  defaultValue: PropControlValue;
};

const COMPONENT_CONTROLS: Record<string, ControlDef[]> = {
  MCButton2: [
    { prop: 'variant', label: 'Variant', type: 'select', options: ['contained', 'outlined', 'text'], defaultValue: 'contained' },
    { prop: 'size', label: 'Size', type: 'select', options: ['small', 'medium', 'large'], defaultValue: 'medium' },
    { prop: 'disabled', label: 'Disabled', type: 'toggle', defaultValue: false },
    { prop: 'loading', label: 'Loading', type: 'toggle', defaultValue: false },
  ],
  MCFormTextInput: [
    { prop: 'state', label: 'State', type: 'select', options: ['default', 'focused', 'error', 'disabled', 'readonly'], defaultValue: 'default' },
    { prop: 'required', label: 'Required', type: 'toggle', defaultValue: false },
  ],
  MCFormCheckBox: [
    { prop: 'checked', label: 'Checked', type: 'toggle', defaultValue: true },
    { prop: 'disabled', label: 'Disabled', type: 'toggle', defaultValue: false },
  ],
  MCFormSwitchInput: [
    { prop: 'on', label: 'On', type: 'toggle', defaultValue: true },
    { prop: 'disabled', label: 'Disabled', type: 'toggle', defaultValue: false },
  ],
  MCFormRadioGroup: [
    { prop: 'disabled', label: 'Disabled', type: 'toggle', defaultValue: false },
  ],
  MCBarTabs: [
    { prop: 'variant', label: 'Variant', type: 'select', options: ['default', 'contained'], defaultValue: 'default' },
  ],
  MCStatus: [
    { prop: 'variant', label: 'Status', type: 'select', options: ['positive', 'warning', 'negative', 'neutral'], defaultValue: 'positive' },
  ],
  MCLoader: [
    { prop: 'size', label: 'Size', type: 'select', options: ['small', 'medium', 'large'], defaultValue: 'medium' },
  ],
  MCCommonDialog: [
    { prop: 'variant', label: 'Variant', type: 'select', options: ['default', 'destructive'], defaultValue: 'default' },
  ],
  MCBanner: [
    { prop: 'variant', label: 'Type', type: 'select', options: ['info', 'success', 'warning', 'error'], defaultValue: 'info' },
  ],
};

export type { PropControlValue, PropValues, ControlDef };

export function useComponentControls(componentName: string) {
  const controls = COMPONENT_CONTROLS[componentName] || [];
  const [values, setValues] = React.useState<PropValues>(() => {
    const initial: PropValues = {};
    for (const c of controls) {
      initial[c.prop] = c.defaultValue;
    }
    return initial;
  });

  const setValue = (prop: string, value: PropControlValue) => {
    setValues(prev => ({ ...prev, [prop]: value }));
  };

  return { controls, values, setValue };
}

export function PropControlsPanel({ controls, values, setValue }: {
  controls: ControlDef[];
  values: PropValues;
  setValue: (prop: string, value: PropControlValue) => void;
}) {
  if (controls.length === 0) return null;

  return (
    <div className="prop-controls">
      {controls.map(control => (
        <div key={control.prop} className="prop-control-item">
          <label className="prop-control-label">{control.label}</label>
          {control.type === 'select' && control.options ? (
            <select
              className="prop-control-select"
              value={String(values[control.prop])}
              onChange={e => setValue(control.prop, e.target.value)}
            >
              {control.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <button
              className={`prop-control-toggle${values[control.prop] ? ' active' : ''}`}
              onClick={() => setValue(control.prop, !values[control.prop])}
            >
              {values[control.prop] ? 'On' : 'Off'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

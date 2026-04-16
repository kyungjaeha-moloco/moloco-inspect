import React, { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCanvasStore } from '../store/canvas-store';

type ControlDef = {
  prop: string;
  label: string;
  type: 'select' | 'toggle';
  options?: string[];
  defaultValue: string | boolean;
};

// Hardcoded COMPONENT_CONTROLS for the 10 components that have prop controls.
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

export const PropPanel = React.memo(function PropPanel() {
  const { selectedComponentId, component, updateComponentProps, removeComponent, moveComponentUp, moveComponentDown } =
    useCanvasStore(
      useShallow((s) => ({
        selectedComponentId: s.selectedComponentId,
        component: s.selectedComponentId
          ? s.components[s.selectedComponentId] ?? null
          : null,
        updateComponentProps: s.updateComponentProps,
        removeComponent: s.removeComponent,
        moveComponentUp: s.moveComponentUp,
        moveComponentDown: s.moveComponentDown,
      })),
    );

  const handlePropChange = useCallback(
    (prop: string, value: string | boolean) => {
      if (!selectedComponentId) return;
      updateComponentProps(selectedComponentId, { [prop]: value });
    },
    [selectedComponentId, updateComponentProps],
  );

  const handleRemove = useCallback(() => {
    if (!selectedComponentId) return;
    removeComponent(selectedComponentId);
  }, [selectedComponentId, removeComponent]);

  const handleMoveUp = useCallback(() => {
    if (!selectedComponentId) return;
    moveComponentUp(selectedComponentId);
  }, [selectedComponentId, moveComponentUp]);

  const handleMoveDown = useCallback(() => {
    if (!selectedComponentId) return;
    moveComponentDown(selectedComponentId);
  }, [selectedComponentId, moveComponentDown]);

  if (!component) {
    return (
      <div
        style={{
          width: 280,
          height: '100%',
          background: '#fafafa',
          borderLeft: '1px solid #e0e0e0',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e0e0e0',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
            Properties
          </span>
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <span style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>
            Select a component to edit its properties
          </span>
        </div>
      </div>
    );
  }

  const controls = COMPONENT_CONTROLS[component.type] ?? [];

  return (
    <div
      style={{
        width: 280,
        height: '100%',
        background: '#fafafa',
        borderLeft: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e0e0e0',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
          Properties
        </span>
        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
          {component.type}
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {controls.length === 0 ? (
          <div
            style={{
              padding: 16,
              textAlign: 'center',
              color: '#999',
              fontSize: 12,
              border: '1px dashed #e0e0e0',
              borderRadius: 6,
              background: '#fff',
            }}
          >
            편집 가능한 속성이 없습니다
          </div>
        ) : (
          controls.map((control) => {
            const value =
              component.props[control.prop] ?? control.defaultValue;
            return (
              <div key={control.prop}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#666',
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}
                >
                  {control.label}
                </label>
                {control.type === 'select' && control.options ? (
                  <select
                    value={String(value)}
                    onChange={(e) =>
                      handlePropChange(control.prop, e.target.value)
                    }
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid #e0e0e0',
                      borderRadius: 6,
                      fontSize: 12,
                      background: '#fff',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    {control.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() =>
                      handlePropChange(control.prop, !value)
                    }
                    style={{
                      padding: '4px 12px',
                      border: '1px solid #e0e0e0',
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      background: value ? '#346bea' : '#fff',
                      color: value ? '#fff' : '#666',
                      fontWeight: 500,
                      transition: 'all 0.15s',
                    }}
                  >
                    {value ? 'On' : 'Off'}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #e0e0e0',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}
      >
        {/* Move up/down */}
        <button
          onClick={handleMoveUp}
          title="Move up"
          style={{
            width: 28,
            height: 28,
            border: '1px solid #e0e0e0',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          &#x2191;
        </button>
        <button
          onClick={handleMoveDown}
          title="Move down"
          style={{
            width: 28,
            height: 28,
            border: '1px solid #e0e0e0',
            borderRadius: 4,
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          &#x2193;
        </button>

        <div style={{ flex: 1 }} />

        {/* Delete */}
        <button
          onClick={handleRemove}
          title="Remove component"
          style={{
            height: 28,
            padding: '0 12px',
            border: '1px solid #fca5a5',
            borderRadius: 4,
            background: '#fff',
            color: '#dc2626',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
});

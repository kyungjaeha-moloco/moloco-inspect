import React, { useState } from 'react';
import type { PropValues } from '../PropControls';
import { handleKeyActivate } from './utils';

export function SwitchPreview({ propValues }: { propValues?: PropValues }) {
  const controlledOn = propValues?.on !== undefined ? Boolean(propValues.on) : undefined;
  const disabled = Boolean(propValues?.disabled);
  const [on, setOn] = useState(true);
  const isOn = controlledOn !== undefined ? controlledOn : on;

  return (
    <div className="preview-inline-row">
      <span className="preview-input-label">Live delivery enabled</span>
      <div
        className={`preview-switch${isOn ? ' on' : ''}`}
        role="switch"
        aria-checked={isOn}
        aria-disabled={disabled}
        aria-label="Live delivery enabled"
        tabIndex={disabled ? -1 : 0}
        onClick={() => { if (!disabled && controlledOn === undefined) setOn(!on); }}
        onKeyDown={handleKeyActivate(() => { if (!disabled && controlledOn === undefined) setOn(!on); })}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}
      >
        <div className="preview-switch-knob" />
      </div>
    </div>
  );
}

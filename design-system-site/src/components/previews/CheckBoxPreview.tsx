import React, { useState } from 'react';
import type { PropValues } from '../PropControls';
import { handleKeyActivate } from './utils';

export function CheckBoxPreview({ propValues }: { propValues?: PropValues }) {
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
          role="checkbox"
          aria-checked={effectiveChecks[i]}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onClick={() => {
            if (disabled) return;
            if (controlledChecked === undefined) {
              const next = [...checks]; next[i] = !next[i]; setChecks(next);
            }
          }}
          onKeyDown={handleKeyActivate(() => {
            if (disabled) return;
            if (controlledChecked === undefined) {
              const next = [...checks]; next[i] = !next[i]; setChecks(next);
            }
          })}
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

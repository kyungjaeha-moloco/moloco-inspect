import React, { useState } from 'react';
import type { PropValues } from '../PropControls';
import { handleKeyActivate } from './utils';

export function RadioPreview({ propValues }: { propValues?: PropValues }) {
  const disabled = Boolean(propValues?.disabled);
  const [selected, setSelected] = useState(0);
  const options = ['CPC', 'CPM', 'CPA'];
  return (
    <div className="preview-radio-shell" role="radiogroup">
      {options.map((opt, i) => (
        <div
          key={opt}
          className="preview-radio-option"
          role="radio"
          aria-checked={selected === i}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : (selected === i ? 0 : -1)}
          onClick={() => { if (!disabled) setSelected(i); }}
          onKeyDown={handleKeyActivate(() => { if (!disabled) setSelected(i); })}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none', opacity: disabled ? 0.4 : 1 }}
        >
          <div className={`preview-radio-dot${selected === i ? ' active' : ''}`} />
          <span>{opt}</span>
        </div>
      ))}
    </div>
  );
}

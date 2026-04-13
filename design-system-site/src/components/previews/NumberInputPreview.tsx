import React, { useState } from 'react';

export function NumberInputPreview() {
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

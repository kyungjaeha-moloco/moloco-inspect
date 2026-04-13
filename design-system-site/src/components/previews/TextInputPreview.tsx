import React, { useState } from 'react';
import type { PropValues } from '../PropControls';

export function TextInputPreview({ propValues }: { propValues?: PropValues }) {
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

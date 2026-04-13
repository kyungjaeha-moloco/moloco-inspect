import React, { useState } from 'react';

export function TextAreaPreview() {
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

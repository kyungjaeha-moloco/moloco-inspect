import React, { useState } from 'react';
import { handleKeyActivate } from './utils';

export function SearchBarPreview() {
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
          role="button"
          aria-label="Clear search"
          tabIndex={0}
          onClick={() => setValue('')}
          onKeyDown={handleKeyActivate(() => setValue(''))}
          style={{ fontSize: 12, color: '#8d8d8d', cursor: 'pointer' }}
        >✕</span>
      )}
    </div>
  );
}

import React, { useState } from 'react';

export function SelectPreview() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('Performance');
  const options = ['Performance', 'Brand Awareness', 'Retargeting'];
  return (
    <div className="preview-input-shell" style={{ maxWidth: 280, position: 'relative' }}>
      <div className="preview-input-label">Campaign type</div>
      <div
        className="preview-input"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); }
          else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
        }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
      >
        <span>{selected}</span>
        <span style={{ fontSize: 11, color: '#8d8d8d' }}>{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div role="listbox" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2, background: '#fff', border: '1px solid #c6c6c6', borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10 }}>
          {options.map(opt => (
            <div
              key={opt}
              role="option"
              aria-selected={opt === selected}
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

import React, { useState } from 'react';
import { handleKeyActivate } from './utils';

export function AccordionPreview() {
  const [open, setOpen] = useState(true);
  return (
    <div className="preview-layout-shell">
      <div
        className="preview-accordion-item"
        role="button"
        aria-expanded={open}
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyActivate(() => setOpen(!open))}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <div className="preview-inline-row">
          <strong>Advanced settings</strong>
          <span className="preview-mini-note">{open ? 'Collapse ▴' : 'Expand ▾'}</span>
        </div>
      </div>
      {open && <div className="preview-panel" style={{ height: 40 }} />}
    </div>
  );
}

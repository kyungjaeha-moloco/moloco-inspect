import React, { useState } from 'react';
import type { PropValues } from '../PropControls';

export function TabsPreview({ propValues }: { propValues?: PropValues }) {
  const [active, setActive] = useState(0);
  const variant = String(propValues?.variant || 'default');
  const tabs = ['Overview', 'Creative', 'Settings'];
  const isContained = variant === 'contained';
  return (
    <div>
      <div className="preview-tabs-mock" role="tablist" style={isContained ? { background: '#f4f4f4', borderRadius: 8, padding: 4, border: 'none' } : undefined}>
        {tabs.map((tab, i) => (
          <div
            key={tab}
            className={`preview-tab-mock${active === i ? ' active' : ''}`}
            role="tab"
            aria-selected={active === i}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'ArrowRight') { e.preventDefault(); setActive((active + 1) % tabs.length); }
              else if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((active - 1 + tabs.length) % tabs.length); }
            }}
            style={{
              cursor: 'pointer', userSelect: 'none',
              ...(isContained && active === i ? { background: '#fff', borderRadius: 6, borderBottom: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' } : {}),
              ...(isContained && active !== i ? { borderBottom: 'none' } : {}),
            }}
          >
            {tab}
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 0', fontSize: 13, color: '#525252' }}>
        {tabs[active]} tab content
      </div>
    </div>
  );
}

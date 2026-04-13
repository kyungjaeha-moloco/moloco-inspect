import React from 'react';
import type { ComponentEntry } from '../../types';

export function AccessibilityTab({ comp }: { comp: ComponentEntry }) {
  if (!comp.accessibility) {
    return <div className="empty-state">No accessibility documentation available for this component.</div>;
  }

  const a11y = comp.accessibility;

  return (
    <>
      {(a11y.role || a11y.ariaLabel) && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">ARIA Attributes</h2>
          </div>
          {a11y.role && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>ARIA Role: </span>
              <code>{a11y.role}</code>
            </div>
          )}
          {a11y.ariaLabel && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-helper)' }}>ARIA Label: </span>
              <code>{a11y.ariaLabel}</code>
            </div>
          )}
        </div>
      )}

      {a11y.keyboardInteraction?.length ? (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Keyboard Interaction</h2>
          </div>
          <table className="props-table">
            <thead><tr><th>Key</th><th>Action</th></tr></thead>
            <tbody>
              {a11y.keyboardInteraction.map((ki, i) => (
                <tr key={i}><td><code>{ki.key}</code></td><td>{ki.action}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {a11y.screenReaderAnnouncement && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Screen Reader</h2>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {a11y.screenReaderAnnouncement}
          </div>
        </div>
      )}

      {a11y.notes?.length ? (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Accessibility Notes</h2>
          </div>
          <ul style={{ paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            {a11y.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </div>
      ) : null}
    </>
  );
}

import React from 'react';
import type { ComponentEntry } from '../../types';

export function StyleTab({ comp }: { comp: ComponentEntry }) {
  if (!comp.structure) {
    return <div className="empty-state">No style specifications available for this component.</div>;
  }

  const { dimensions, padding, spacing, border, background, notes } = comp.structure;

  const hasRecordSections = (dimensions && Object.keys(dimensions).length > 0) || (padding && Object.keys(padding).length > 0);
  const hasStringSections = spacing || border || background;

  return (
    <>
      {dimensions && Object.keys(dimensions).length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Dimensions</h2>
          </div>
          <table className="props-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(dimensions).map(([prop, value]) => (
                <tr key={prop}>
                  <td><code>{prop}</code></td>
                  <td><code>{value}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {padding && Object.keys(padding).length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Padding</h2>
          </div>
          <table className="props-table">
            <thead>
              <tr>
                <th>Property</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(padding).map(([prop, value]) => (
                <tr key={prop}>
                  <td><code>{prop}</code></td>
                  <td><code>{value}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {spacing && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Spacing</h2>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            <code>{spacing}</code>
          </div>
        </div>
      )}

      {border && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Border</h2>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            <code>{border}</code>
          </div>
        </div>
      )}

      {background && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Background</h2>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            <code>{background}</code>
          </div>
        </div>
      )}

      {notes && notes.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Layout Notes</h2>
          </div>
          <ul style={{ paddingLeft: 20, color: 'var(--text-secondary)' }}>
            {notes.map((note, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {!hasRecordSections && !hasStringSections && (
        <div className="empty-state">No dimensional specifications available.</div>
      )}
    </>
  );
}

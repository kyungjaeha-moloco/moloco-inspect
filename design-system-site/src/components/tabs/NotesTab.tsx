import React from 'react';
import type { ComponentEntry } from '../../types';

export function NotesTab({ comp }: { comp: ComponentEntry }) {
  const hasNotes = comp.notes && comp.notes.length > 0;

  if (!hasNotes) {
    return <div className="empty-state">No notes available for this component.</div>;
  }

  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">Notes</h2>
      </div>
      <ul style={{ paddingLeft: 20, color: 'var(--text-secondary)' }}>
        {comp.notes!.map((note, i) => <li key={i} style={{ marginBottom: 4 }}>{note}</li>)}
      </ul>
    </div>
  );
}

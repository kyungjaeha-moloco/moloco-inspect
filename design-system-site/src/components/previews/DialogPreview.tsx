import React, { useState } from 'react';
import type { PropValues } from '../PropControls';
import { handleKeyActivate } from './utils';

export function DialogPreview({ propValues }: { propValues?: PropValues }) {
  const [open, setOpen] = useState(true);
  const variant = String(propValues?.variant || 'default');
  const isDestructive = variant === 'destructive';

  if (!open) {
    return (
      <div
        className="preview-button primary"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={handleKeyActivate(() => setOpen(true))}
        style={{ cursor: 'pointer' }}
      >
        Open dialog
      </div>
    );
  }
  const dialogTitle = isDestructive ? 'Delete creative' : 'Confirm action';
  return (
    <div
      className="preview-dialog-shell"
      role="dialog"
      aria-modal="true"
      aria-label={dialogTitle}
    >
      <div className="preview-dialog-title">{dialogTitle}</div>
      <div className="preview-dialog-copy">{isDestructive ? 'This action cannot be undone.' : 'Are you sure you want to proceed?'}</div>
      <div className="preview-button-row">
        <div
          className="preview-button secondary"
          role="button"
          tabIndex={0}
          onClick={() => setOpen(false)}
          onKeyDown={handleKeyActivate(() => setOpen(false))}
          style={{ cursor: 'pointer' }}
        >
          Cancel
        </div>
        <div
          className="preview-button primary"
          role="button"
          tabIndex={0}
          onClick={() => setOpen(false)}
          onKeyDown={handleKeyActivate(() => setOpen(false))}
          style={{ cursor: 'pointer', background: isDestructive ? '#da1e28' : undefined }}
        >
          {isDestructive ? 'Delete' : 'Confirm'}
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import type { PropValues } from '../PropControls';

export function StatusPreview({ propValues }: { propValues?: PropValues }) {
  const variant = String(propValues?.variant || 'positive');
  const variantMap: Record<string, { className: string; label: string }> = {
    positive: { className: 'active', label: 'Healthy' },
    warning: { className: 'warning', label: 'Pending' },
    negative: { className: 'error', label: 'Rejected' },
    neutral: { className: 'muted', label: 'Inactive' },
  };
  const current = variantMap[variant] || variantMap.positive;
  return (
    <div className="preview-status-row">
      <div className={`preview-pill ${current.className}`}>{current.label}</div>
    </div>
  );
}

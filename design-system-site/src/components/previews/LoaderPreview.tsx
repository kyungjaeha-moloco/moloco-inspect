import React from 'react';
import type { PropValues } from '../PropControls';

export function LoaderPreview({ propValues }: { propValues?: PropValues }) {
  const size = String(propValues?.size || 'medium');
  const sizeMap: Record<string, number> = { small: 20, medium: 32, large: 48 };
  const px = sizeMap[size] || 32;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div className="preview-spinner" style={{ width: px, height: px }} />
      <span style={{ fontSize: 12, color: '#8d8d8d' }}>Loading...</span>
    </div>
  );
}

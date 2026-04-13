import React, { useState } from 'react';
import type { PropValues } from '../PropControls';
import { handleKeyActivate } from './utils';

export function ButtonPreview({ propValues }: { propValues?: PropValues }) {
  const [clicked, setClicked] = useState<string | null>(null);
  const variant = String(propValues?.variant || 'contained');
  const size = String(propValues?.size || 'medium');
  const disabled = Boolean(propValues?.disabled);
  const loading = Boolean(propValues?.loading);

  const sizeStyles: Record<string, React.CSSProperties> = {
    small: { padding: '4px 12px', fontSize: 12 },
    medium: { padding: '8px 16px', fontSize: 13 },
    large: { padding: '12px 24px', fontSize: 15 },
  };

  const variantClass = variant === 'contained' ? 'primary' : variant === 'outlined' ? 'secondary' : 'ghost';

  return (
    <div className="preview-button-row">
      <div
        className={`preview-button ${variantClass}${clicked ? ' preview-button-pressed' : ''}`}
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={() => {
          if (disabled || loading) return;
          setClicked('yes'); setTimeout(() => setClicked(null), 300);
        }}
        onKeyDown={handleKeyActivate(() => {
          if (disabled || loading) return;
          setClicked('yes'); setTimeout(() => setClicked(null), 300);
        })}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          opacity: disabled ? 0.4 : 1,
          ...sizeStyles[size],
        }}
      >
        {loading ? 'Loading...' : clicked ? '✓ Clicked' : 'Create campaign'}
      </div>
      <div
        className="preview-button secondary"
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          opacity: disabled ? 0.4 : 1,
          ...sizeStyles[size],
        }}
      >
        Cancel
      </div>
    </div>
  );
}

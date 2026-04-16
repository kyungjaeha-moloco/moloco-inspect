import React, { useCallback } from 'react';
import type { PaletteItem } from './palette-data';

interface Props {
  item: PaletteItem;
}

export const ComponentItem = React.memo(function ComponentItem({ item }: Props) {
  const handleDragStart = useCallback(
    (event: React.DragEvent) => {
      // Set the component type as drag data — consumed by useCanvasDropHandler
      event.dataTransfer.setData('application/canvas-component-type', item.type);
      event.dataTransfer.effectAllowed = 'move';
    },
    [item.type],
  );

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        padding: '8px 12px',
        borderRadius: 6,
        border: '1px solid #e0e0e0',
        background: '#fff',
        cursor: 'grab',
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        userSelect: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#346bea';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(52,107,234,0.15)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = '#e0e0e0';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      <span style={{ fontWeight: 500, color: '#333' }}>{item.label}</span>
      {!item.hasPreview && (
        <span
          style={{
            fontSize: 9,
            color: '#999',
            background: '#f5f5f5',
            padding: '2px 6px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}
        >
          preview soon
        </span>
      )}
    </div>
  );
});

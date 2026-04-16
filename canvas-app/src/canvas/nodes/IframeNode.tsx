import React, { useState, useCallback } from 'react';
import { Handle, Position, NodeResizer, type NodeProps, type Node } from '@xyflow/react';
import type { IframeData } from '../../types';

export type IframeNodeType = Node<IframeData, 'iframe'>;

export const IframeNode = React.memo(function IframeNode({
  data,
  selected,
}: NodeProps<IframeNodeType>) {
  const [interactable, setInteractable] = useState(false);

  const toggleInteraction = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setInteractable((prev) => !prev);
  }, []);

  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={400}
        minHeight={300}
        lineStyle={{ stroke: '#346bea', strokeWidth: 1 }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#346bea', border: 'none' }}
      />
      <div style={{
        width: '100%',
        height: '100%',
        background: '#ffffff',
        borderRadius: 8,
        border: selected ? '2px solid #346bea' : '1px solid #e0e0e0',
        boxShadow: selected ? '0 0 0 2px rgba(52,107,234,0.2)' : '0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Title bar */}
        <div style={{
          background: '#f5f5f5',
          borderBottom: '1px solid #e0e0e0',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'grab',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#28c840' }} />
          </div>
          <div style={{
            fontSize: 11, color: '#666', fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            {data.name}
          </div>
          <div style={{ fontSize: 10, color: '#999', fontFamily: 'monospace', marginRight: 8 }}>
            {data.url}
          </div>
          <button
            onClick={toggleInteraction}
            title={interactable ? 'Lock interaction (for canvas dragging)' : 'Enable interaction (click inside iframe)'}
            style={{
              background: interactable ? '#346bea' : '#eee',
              color: interactable ? '#fff' : '#888',
              border: 'none',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 10,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {interactable ? '🔓 Interactive' : '🔒 View Only'}
          </button>
        </div>

        {/* iframe */}
        <div style={{ flex: 1, position: 'relative' }}>
          <iframe
            src={data.url}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              pointerEvents: interactable ? 'auto' : 'none',
            }}
            title={data.name}
            loading="lazy"
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={{ background: '#346bea' }} />
      <Handle type="target" position={Position.Left} style={{ background: '#346bea' }} />
    </>
  );
});

import React, { useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ScreenNode as ScreenNodeType } from '../../types';
import { DSComponentRenderer } from '../../ds-registry/DSComponentRenderer';
import { useCanvasStore } from '../../store/canvas-store';

export const ScreenNode = React.memo(function ScreenNode({
  id, data, selected,
}: NodeProps<ScreenNodeType>) {
  const allComponents = useCanvasStore((s) => s.components);
  const components = useMemo(
    () => Object.values(allComponents)
      .filter((c) => c.screenId === id && c.parentId === null)
      .sort((a, b) => a.order - b.order),
    [allComponents, id],
  );

  return (
    <div style={{
      width: data.width, minHeight: data.height, background: '#ffffff',
      borderRadius: 8,
      border: selected ? '2px solid #346bea' : '1px solid #e0e0e0',
      boxShadow: selected ? '0 0 0 2px rgba(52,107,234,0.2)' : '0 2px 8px rgba(0,0,0,0.08)',
      overflow: 'hidden', fontSize: 14,
    }}>
      {/* Title bar */}
      <div style={{
        background: '#f5f5f5', borderBottom: '1px solid #e0e0e0',
        padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8,
        cursor: data.locked ? 'default' : 'grab',
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
        {data.locked && <span style={{ fontSize: 10, color: '#999' }}>🔒</span>}
      </div>

      {/* Components */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {components.length === 0 ? (
          <div style={{
            padding: 24, textAlign: 'center', color: '#ccc', fontSize: 12,
            border: '1px dashed #e0e0e0', borderRadius: 6,
          }}>
            컴포넌트를 추가하세요
          </div>
        ) : (
          components.map((comp) => (
            <DSComponentRenderer key={comp.id} component={comp} />
          ))
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: '#346bea' }} />
      <Handle type="target" position={Position.Left} style={{ background: '#346bea' }} />
    </div>
  );
});

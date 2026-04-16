import React from 'react';
import type { NodeProps } from '@xyflow/react';
import type { SectionNode as SectionNodeType } from '../../types';

export const SectionNode = React.memo(function SectionNode({
  data,
}: NodeProps<SectionNodeType>) {
  return (
    <div style={{
      width: '100%', height: '100%', borderRadius: 12,
      border: `2px dashed ${data.color}`, background: `${data.color}08`,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: -28, left: 8, fontSize: 13,
        fontWeight: 600, color: data.color, background: '#0a0a14',
        padding: '2px 10px', borderRadius: 4, userSelect: 'none',
      }}>
        {data.name}
      </div>
    </div>
  );
});

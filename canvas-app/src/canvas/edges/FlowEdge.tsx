import React from 'react';
import {
  BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps,
} from '@xyflow/react';
import type { FlowEdge as FlowEdgeType } from '../../types';

export const FlowEdge = React.memo(function FlowEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, data, selected,
}: EdgeProps<FlowEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{
        stroke: selected ? '#346bea' : '#94a3b8', strokeWidth: selected ? 2 : 1.5,
      }} markerEnd="url(#arrow-marker)" />
      {data?.label && (
        <EdgeLabelRenderer>
          <div style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            fontSize: 11, fontWeight: 500, color: '#666',
            background: '#fff', border: '1px solid #e0e0e0',
            borderRadius: 4, padding: '2px 8px', pointerEvents: 'all',
          }}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

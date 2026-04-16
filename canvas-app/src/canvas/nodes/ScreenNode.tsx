import React, { useCallback, useMemo, useState } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { ScreenNode as ScreenNodeType } from '../../types';
import { DSComponentRenderer } from '../../ds-registry/DSComponentRenderer';
import { useCanvasStore } from '../../store/canvas-store';
import { CommentOverlay } from '../../feedback/CommentOverlay';

export const ScreenNode = React.memo(function ScreenNode({
  id,
  data,
  selected,
}: NodeProps<ScreenNodeType>) {
  const toggleNodeLock = useCanvasStore((s) => s.toggleNodeLock);
  const setSelectedComponentId = useCanvasStore((s) => s.setSelectedComponentId);
  const allComponents = useCanvasStore((s) => s.components);
  const components = useMemo(
    () => Object.values(allComponents)
      .filter((c) => c.screenId === id && c.parentId === null)
      .sort((a, b) => a.order - b.order),
    [allComponents, id],
  );

  const [isDragOver, setIsDragOver] = useState(false);

  const handleLockToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleNodeLock(id);
    },
    [id, toggleNodeLock],
  );

  const handleBodyClick = useCallback(
    (e: React.MouseEvent) => {
      // Only deselect if clicking on the body itself, not on a component
      if (e.target === e.currentTarget) {
        setSelectedComponentId(null);
      }
    },
    [setSelectedComponentId],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/canvas-component-type')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDragOver(false);
      const componentType = e.dataTransfer.getData('application/canvas-component-type');
      if (!componentType) return;
      e.preventDefault();
      e.stopPropagation();
      useCanvasStore.getState().addComponent(id, componentType);
    },
    [id],
  );

  const isLocked = data.locked;

  return (
    <>
      {/* NodeResizer — only visible when selected and not locked */}
      <NodeResizer
        isVisible={selected && !isLocked}
        minWidth={200}
        minHeight={150}
        lineStyle={{ stroke: '#346bea', strokeWidth: 1 }}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: '#346bea',
          border: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          minHeight: data.height,
          background: '#ffffff',
          borderRadius: 8,
          border: selected
            ? '2px solid #346bea'
            : isDragOver
              ? '2px solid #60a5fa'
              : '1px solid #e0e0e0',
          boxShadow: selected
            ? '0 0 0 2px rgba(52,107,234,0.2)'
            : isDragOver
              ? '0 0 0 2px rgba(96,165,250,0.2)'
              : '0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'visible',
          fontSize: 14,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          position: 'relative',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            background: '#f5f5f5',
            borderBottom: '1px solid #e0e0e0',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: isLocked ? 'default' : 'grab',
          }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#ff5f57',
              }}
            />
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#febc2e',
              }}
            />
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#28c840',
              }}
            />
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#666',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {data.name}
          </div>
          <button
            onClick={handleLockToggle}
            title={isLocked ? 'Unlock node' : 'Lock node'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 10,
              color: isLocked ? '#e67e22' : '#bbb',
              padding: '2px 4px',
              borderRadius: 3,
              lineHeight: 1,
            }}
          >
            {isLocked ? '\uD83D\uDD12' : '\uD83D\uDD13'}
          </button>
        </div>

        {/* Components wrapper — overflow hidden to prevent DS content leakage */}
        <div style={{ overflow: 'hidden' }}>
          {data.customHtml ? (
            <div
              dangerouslySetInnerHTML={{ __html: data.customHtml }}
              style={{ width: '100%', height: '100%' }}
            />
          ) : (
            <div
              onClick={handleBodyClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minHeight: 60,
              }}
            >
              {components.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: 'center',
                    color: isDragOver ? '#346bea' : '#ccc',
                    fontSize: 12,
                    border: `1px dashed ${isDragOver ? '#346bea' : '#e0e0e0'}`,
                    borderRadius: 6,
                    background: isDragOver ? '#f0f5ff' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  {isDragOver ? 'Drop here' : 'Drag a component here'}
                </div>
              ) : (
                components.map((comp) => (
                  <DSComponentRenderer key={comp.id} component={comp} />
                ))
              )}
            </div>
          )}
        </div>

        {/* Comment overlay — absolute pins + thread popup */}
        <CommentOverlay screenId={id} />

        {/* Connection handles */}
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: '#346bea' }}
        />
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: '#346bea' }}
        />
      </div>
    </>
  );
});

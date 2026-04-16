import React, { Component, useCallback, type ReactNode } from 'react';
import { PREVIEW_REGISTRY } from './registry';
import { useCanvasStore } from '../store/canvas-store';
import type { ScreenComponent } from '../types';

interface ErrorBoundaryState {
  hasError: boolean;
}

class PreviewErrorBoundary extends Component<
  { componentType: string; children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 12, background: '#2a1a1a', border: '1px solid #b91c1c',
          borderRadius: 6, color: '#f87171', fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{this.props.componentType}</div>
          <div style={{ color: '#888' }}>렌더링 실패</div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface Props {
  component: ScreenComponent;
}

export const DSComponentRenderer = React.memo(function DSComponentRenderer({ component }: Props) {
  const isSelected = useCanvasStore((s) => s.selectedComponentId === component.id);
  const setSelectedComponentId = useCanvasStore((s) => s.setSelectedComponentId);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedComponentId(component.id);
    },
    [component.id, setSelectedComponentId],
  );

  const Preview = PREVIEW_REGISTRY[component.type];

  const wrapperStyle: React.CSSProperties = {
    position: 'relative',
    borderRadius: 6,
    border: isSelected ? '2px solid #346bea' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  };

  if (!Preview) {
    return (
      <div onClick={handleClick} style={wrapperStyle}>
        <div style={{
          padding: 12, background: '#f8f9fa', border: '1px dashed #d0d0d0',
          borderRadius: 6, color: '#888', fontSize: 12, textAlign: 'center',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{component.type}</div>
          <div style={{ fontSize: 10, color: '#aaa' }}>프리뷰 없음</div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={handleClick} style={wrapperStyle}>
      <PreviewErrorBoundary componentType={component.type}>
        <Preview propValues={component.props} />
      </PreviewErrorBoundary>
    </div>
  );
});

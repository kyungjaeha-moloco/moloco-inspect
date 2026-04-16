import React, { Component, type ReactNode } from 'react';
import { PREVIEW_REGISTRY } from './registry';
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
  const Preview = PREVIEW_REGISTRY[component.type];

  if (!Preview) {
    return (
      <div style={{
        padding: 12, background: '#f8f9fa', border: '1px dashed #d0d0d0',
        borderRadius: 6, color: '#888', fontSize: 12, textAlign: 'center',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{component.type}</div>
        <div style={{ fontSize: 10, color: '#aaa' }}>프리뷰 없음</div>
      </div>
    );
  }

  return (
    <PreviewErrorBoundary componentType={component.type}>
      <Preview propValues={component.props} />
    </PreviewErrorBoundary>
  );
});

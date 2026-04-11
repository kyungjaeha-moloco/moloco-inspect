import React, { useState } from 'react';
import { FormikHarness } from '../providers/FormikHarness';

interface ComponentPreviewProps {
  title: string;
  description?: string;
  /** Formik initial values if the component needs Formik context */
  formikValues?: Record<string, unknown>;
  children: React.ReactNode;
}

/**
 * Renders a live MSM Portal component inside a preview card.
 * Automatically wraps in FormikHarness if formikValues is provided.
 */
export function ComponentPreview({
  title,
  description,
  formikValues,
  children,
}: ComponentPreviewProps) {
  const [expanded, setExpanded] = useState(true);

  const content = formikValues ? (
    <FormikHarness initialValues={formikValues}>{children}</FormikHarness>
  ) : (
    children
  );

  return (
    <div style={{
      border: '1px solid #E5E7EB',
      borderRadius: 8,
      background: '#FFFFFF',
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid #E5E7EB' : 'none',
          background: '#F9FAFB',
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{title}</div>
          {description && (
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{description}</div>
          )}
        </div>
        <span style={{
          fontSize: 12,
          color: '#9CA3AF',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 150ms',
        }}>
          &#9660;
        </span>
      </div>

      {/* Live Preview */}
      {expanded && (
        <div style={{ padding: 24 }}>
          {content}
        </div>
      )}
    </div>
  );
}

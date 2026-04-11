import React, { useState } from 'react';
import conventionsData from '../../../src/conventions.json';

type ConventionsData = Record<string, unknown>;

function SectionCard({ title, data }: { title: string; data: unknown }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{
      border: '1px solid #E5E7EB',
      borderRadius: 8,
      marginBottom: 12,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: expanded ? '#F0F4FF' : '#FAFAFA',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 150ms',
        }}
      >
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#1F2937',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          textTransform: 'capitalize' as const,
        }}>
          {title.replace(/_/g, ' ')}
        </div>
        <span style={{
          fontSize: 12,
          color: '#2563EB',
          transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 150ms',
          flexShrink: 0,
          marginLeft: 12,
        }}>
          ▼
        </span>
      </button>

      {expanded && (
        <div style={{ padding: 16, borderTop: '1px solid #E5E7EB', background: '#FFFFFF' }}>
          {renderValue(data)}
        </div>
      )}
    </div>
  );
}

function renderValue(value: unknown, depth = 0): React.ReactNode {
  if (value === null || value === undefined) {
    return <span style={{ color: '#9CA3AF', fontSize: 13 }}>—</span>;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return (
      <span style={{
        fontSize: 13,
        color: '#374151',
        fontFamily: typeof value === 'string' && value.startsWith('/') ? 'monospace' : 'inherit',
      }}>
        {String(value)}
      </span>
    );
  }

  if (Array.isArray(value)) {
    return (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {value.map((item, i) => (
          <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
            {renderValue(item, depth + 1)}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);

    if (keys.length === 0) return <span style={{ color: '#9CA3AF', fontSize: 13 }}>empty</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {keys.map((key) => (
          <div key={key} style={{
            paddingLeft: depth > 0 ? 12 : 0,
            borderLeft: depth > 0 ? '2px solid #E5E7EB' : 'none',
          }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              color: '#9CA3AF',
              marginBottom: 3,
            }}>
              {key.replace(/_/g, ' ')}
            </div>
            <div>{renderValue(obj[key], depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

export function ConventionsPage() {
  const data = conventionsData as ConventionsData;
  const sections = Object.entries(data);

  return (
    <div>
      <h1 style={{
        fontSize: 24,
        fontWeight: 700,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        marginBottom: 8,
      }}>
        Conventions
      </h1>

      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>
        Naming rules, file structure, import order, and architecture guidelines from{' '}
        <code>design-system/src/conventions.json</code>.
      </p>

      {sections.map(([key, value]) => (
        <SectionCard key={key} title={key} data={value} />
      ))}
    </div>
  );
}

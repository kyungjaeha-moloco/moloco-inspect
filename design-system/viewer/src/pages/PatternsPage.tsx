import React, { useState } from 'react';
import patternsData from '../../../src/patterns.json';

interface Pattern {
  name?: string;
  description?: string;
  when_to_use?: string | string[];
  file_checklist?: string[];
  structure?: unknown;
  example?: unknown;
  [key: string]: unknown;
}

type PatternsData = Record<string, Pattern> | { patterns?: Record<string, Pattern> } | unknown;

function getPatternEntries(data: PatternsData): [string, Pattern][] {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (obj.patterns && typeof obj.patterns === 'object') {
      return Object.entries(obj.patterns as Record<string, Pattern>);
    }
    return Object.entries(obj) as [string, Pattern][];
  }
  return [];
}

function PatternCard({ id, pattern }: { id: string; pattern: Pattern }) {
  const [expanded, setExpanded] = useState(false);

  const title = pattern.name || id;
  const description = pattern.description || '';

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
        <div>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#1F2937',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            {title}
          </div>
          {description && (
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              {description}
            </div>
          )}
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
          {pattern.when_to_use && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 6 }}>
                When to Use
              </div>
              {Array.isArray(pattern.when_to_use) ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {pattern.when_to_use.map((item, i) => (
                    <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{pattern.when_to_use}</p>
              )}
            </div>
          )}

          {pattern.file_checklist && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 6 }}>
                File Checklist
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {pattern.file_checklist.map((file, i) => (
                  <li key={i} style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace', marginBottom: 2 }}>{file}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 6 }}>
              Full Data
            </div>
            <pre style={{
              background: '#F8F9FA',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              padding: 12,
              fontSize: 11,
              overflow: 'auto',
              maxHeight: 400,
              margin: 0,
            }}>
              {JSON.stringify(pattern, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function PatternsPage() {
  const [filter, setFilter] = useState('');
  const entries = getPatternEntries(patternsData as PatternsData);

  const filtered = entries.filter(([id, pattern]) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      id.toLowerCase().includes(q) ||
      (pattern.name || '').toLowerCase().includes(q) ||
      (pattern.description || '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{
          fontSize: 24,
          fontWeight: 700,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          margin: 0,
        }}>
          Patterns
        </h1>
        <input
          type="text"
          placeholder="Filter patterns..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: 220,
            height: 34,
            padding: '0 12px',
            border: '1px solid #E5E7EB',
            borderRadius: 6,
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>

      <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>
        Composition patterns from <code>design-system/src/patterns.json</code>. {filtered.length} pattern{filtered.length !== 1 ? 's' : ''} found.
      </p>

      {filtered.length === 0 ? (
        <div style={{ fontSize: 14, color: '#9CA3AF', padding: 24, textAlign: 'center' }}>
          No patterns match "{filter}"
        </div>
      ) : (
        filtered.map(([id, pattern]) => (
          <PatternCard key={id} id={id} pattern={pattern} />
        ))
      )}
    </div>
  );
}

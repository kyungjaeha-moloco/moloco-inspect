import React, { useState } from 'react';
import apiContractsData from '../../../src/api-ui-contracts.json';

type ContractsData = Record<string, unknown>;

function EntityCard({ id, entity }: { id: string; entity: unknown }) {
  const [expanded, setExpanded] = useState(false);

  const obj = entity && typeof entity === 'object' ? entity as Record<string, unknown> : null;
  const description = obj?.description as string | undefined;
  const protoModel = obj?.proto_to_model;
  const uiMapping = obj?.ui_mapping;
  const formFields = obj?.form_fields;

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
            {id}
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
          {protoModel != null && (
            <MappingSection title="Proto to Model" data={protoModel} color="#6366F1" />
          )}
          {uiMapping != null && (
            <MappingSection title="UI Mapping" data={uiMapping} color="#059669" />
          )}
          {formFields != null && (
            <MappingSection title="Form Fields" data={formFields} color="#D97706" />
          )}

          {/* Remaining keys not already displayed */}
          {obj && Object.entries(obj)
            .filter(([k]) => !['description', 'proto_to_model', 'ui_mapping', 'form_fields'].includes(k))
            .map(([k, v]) => (
              <MappingSection key={k} title={k.replace(/_/g, ' ')} data={v} color="#6B7280" />
            ))
          }
        </div>
      )}
    </div>
  );
}

function MappingSection({ title, data, color }: { title: string; data: unknown; color: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase' as const,
        color,
        marginBottom: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }} />
        {title}
      </div>
      {typeof data === 'string' ? (
        <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{data}</p>
      ) : Array.isArray(data) ? (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {data.map((item, i) => (
            <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
              {typeof item === 'object' ? JSON.stringify(item) : String(item)}
            </li>
          ))}
        </ul>
      ) : (
        <pre style={{
          background: '#F8F9FA',
          border: '1px solid #E5E7EB',
          borderRadius: 6,
          padding: 12,
          fontSize: 11,
          overflow: 'auto',
          maxHeight: 300,
          margin: 0,
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ApiContractsPage() {
  const [filter, setFilter] = useState('');
  const data = apiContractsData as ContractsData;

  const entries = Object.entries(data);
  const filtered = entries.filter(([id]) => {
    if (!filter) return true;
    return id.toLowerCase().includes(filter.toLowerCase());
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
          API Contracts
        </h1>
        <input
          type="text"
          placeholder="Filter entities..."
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
        Entity mappings (proto to model to UI) from <code>design-system/src/api-ui-contracts.json</code>.{' '}
        {filtered.length} entr{filtered.length !== 1 ? 'ies' : 'y'} found.
      </p>

      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 20,
        flexWrap: 'wrap' as const,
      }}>
        {[
          { color: '#6366F1', label: 'Proto to Model' },
          { color: '#059669', label: 'UI Mapping' },
          { color: '#D97706', label: 'Form Fields' },
        ].map(({ color, label }) => (
          <span key={label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: '#6B7280',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontSize: 14, color: '#9CA3AF', padding: 24, textAlign: 'center' }}>
          No entities match "{filter}"
        </div>
      ) : (
        filtered.map(([id, entity]) => (
          <EntityCard key={id} id={id} entity={entity} />
        ))
      )}
    </div>
  );
}

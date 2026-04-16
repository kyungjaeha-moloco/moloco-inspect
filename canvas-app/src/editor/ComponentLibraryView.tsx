import React, { useMemo, useState } from 'react';
import { buildPaletteCategories } from './palette-data';
import { PREVIEW_REGISTRY } from '../ds-registry/registry';

interface Props {
  onClose: () => void;
}

export const ComponentLibraryView = React.memo(function ComponentLibraryView({
  onClose,
}: Props) {
  const categories = useMemo(() => buildPaletteCategories(), []);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.type.toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, searchQuery]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            cursor: 'pointer',
            padding: '4px 12px',
            fontSize: 12,
            color: '#666',
          }}
        >
          &larr; Back to Canvas
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#333', margin: 0 }}>
          Component Library
        </h1>
        <input
          type="text"
          placeholder="Search components..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            marginLeft: 'auto',
            width: 240,
            padding: '6px 12px',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 32px',
        }}
      >
        {filteredCategories.map((cat) => (
          <div key={cat.name} style={{ marginBottom: 32 }}>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#333',
                marginBottom: 12,
                borderBottom: '1px solid #e0e0e0',
                paddingBottom: 8,
              }}
            >
              {cat.name}
              <span style={{ color: '#999', fontWeight: 400, marginLeft: 8 }}>
                ({cat.items.length})
              </span>
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {cat.items.map((item) => {
                const Preview = PREVIEW_REGISTRY[item.type];
                return (
                  <div
                    key={item.type}
                    style={{
                      border: '1px solid #e0e0e0',
                      borderRadius: 8,
                      padding: 16,
                      background: '#fafafa',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#333',
                        marginBottom: 4,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: '#999',
                        marginBottom: 12,
                        fontFamily: 'monospace',
                      }}
                    >
                      {item.type}
                    </div>
                    <div
                      style={{
                        minHeight: 48,
                        padding: 12,
                        background: '#fff',
                        borderRadius: 6,
                        border: '1px solid #e8e8e8',
                      }}
                    >
                      {Preview ? (
                        <Preview />
                      ) : (
                        <div
                          style={{
                            textAlign: 'center',
                            color: '#ccc',
                            fontSize: 11,
                          }}
                        >
                          Preview coming soon
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

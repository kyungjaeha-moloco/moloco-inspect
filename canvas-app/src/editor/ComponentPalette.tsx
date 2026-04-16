import React, { useMemo, useState, useCallback } from 'react';
import { buildPaletteCategories } from './palette-data';
import { ComponentItem } from './ComponentItem';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

export const ComponentPalette = React.memo(function ComponentPalette({
  isOpen,
  onToggle,
}: Props) {
  const categories = useMemo(() => buildPaletteCategories(), []);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState('');

  const toggleCategory = useCallback((name: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

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

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        title="Open Component Palette"
        style={{
          position: 'absolute',
          top: 60,
          left: 12,
          zIndex: 10,
          width: 36,
          height: 36,
          borderRadius: 8,
          border: '1px solid #e0e0e0',
          background: '#fff',
          cursor: 'pointer',
          fontSize: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        +
      </button>
    );
  }

  return (
    <div
      style={{
        width: 260,
        height: '100%',
        background: '#fafafa',
        borderRight: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
          Components
        </span>
        <button
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: '#999',
            padding: '2px 4px',
            lineHeight: 1,
          }}
          title="Close palette"
        >
          &times;
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px' }}>
        <input
          type="text"
          placeholder="Search components..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            fontSize: 12,
            outline: 'none',
            background: '#fff',
          }}
        />
      </div>

      {/* Category list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 12px 12px',
        }}
      >
        {filteredCategories.map((cat) => {
          const isCollapsed = collapsedCategories.has(cat.name);
          return (
            <div key={cat.name} style={{ marginBottom: 8 }}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '6px 0',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#666',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                <span
                  style={{
                    fontSize: 8,
                    transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s',
                  }}
                >
                  &#9660;
                </span>
                {cat.name}
                <span style={{ color: '#bbb', fontWeight: 400 }}>
                  ({cat.items.length})
                </span>
              </button>
              {/* Items */}
              {!isCollapsed && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    paddingLeft: 4,
                  }}
                >
                  {cat.items.map((item) => (
                    <ComponentItem key={item.type} item={item} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filteredCategories.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: 'center',
              color: '#999',
              fontSize: 12,
            }}
          >
            No components found
          </div>
        )}
      </div>
    </div>
  );
});

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { ComponentsCatalog, ComponentEntry } from '../types';
import { slugify } from '../utils';
import { ComponentPreview } from '../components/ComponentPreview';

type Props = { catalog: ComponentsCatalog };

function statusBadge(status?: string) {
  if (!status) return null;
  const s = status.toLowerCase();
  const cls = s === 'stable' ? 'badge-success'
    : s === 'deprecated' ? 'badge-danger'
    : s === 'experimental' ? 'badge-warning'
    : 'badge-neutral';
  return <span className={`badge ${cls}`}>{status}</span>;
}

const ComponentCard = React.memo(function ComponentCard({ comp }: { comp: ComponentEntry & { categoryName: string } }) {
  return (
    <Link
      to={`/components/${slugify(comp.name)}`}
      className="card"
    >
      <div style={{ marginBottom: 12, pointerEvents: 'none' }}>
        <ComponentPreview component={comp} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>{comp.name}</div>
        {statusBadge(comp.status)}
      </div>
      <div className="card-desc">{comp.shortDescription ?? comp.description}</div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <span className="badge badge-neutral">{comp.categoryName}</span>
        {comp.tierName && <span className="badge badge-info">{comp.tierName}</span>}
      </div>
    </Link>
  );
});

export function ComponentsPage({ catalog }: Props) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const allComponents = useMemo(() => {
    const list: Array<ComponentEntry & { categoryName: string }> = [];
    for (const cat of catalog.categories) {
      for (const comp of cat.components) {
        list.push({ ...comp, categoryName: cat.name });
      }
    }
    return list;
  }, [catalog]);

  const filtered = useMemo(() => {
    let result = allComponents;
    if (categoryFilter) {
      result = result.filter((c) => c.categoryName === categoryFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [allComponents, search, categoryFilter]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Components</h1>
        <p className="page-subtitle">Browse all {catalog.meta.totalComponents} components in the design system.</p>
      </div>

      <div className="filter-bar">
        <input
          className="search-input"
          placeholder="Search components..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {catalog.categories.map((cat) => (
            <option key={cat.name} value={cat.name}>{cat.name} ({cat.count})</option>
          ))}
        </select>
      </div>

      <div className="card-grid">
        {filtered.map((comp) => (
          <ComponentCard key={comp.name} comp={comp} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">No components match your search.</div>
      )}
    </>
  );
}

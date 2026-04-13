import React from 'react';
import type { ComponentsCatalog, GovernanceJson } from '../types';

type Props = {
  catalog: ComponentsCatalog;
  depCount: number;
  governanceData: GovernanceJson;
};

export function OverviewPage({ catalog, depCount, governanceData }: Props) {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Moloco Design System</h1>
        <p className="page-subtitle">
          A unified component library and design language for building consistent, accessible interfaces across the Moloco platform.
        </p>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{catalog.meta.totalComponents}</div>
          <div className="stat-label">Components</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{catalog.meta.totalCategories}</div>
          <div className="stat-label">Categories</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{depCount}</div>
          <div className="stat-label">Dependency Maps</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{governanceData.promotion_queue?.length ?? 0}</div>
          <div className="stat-label">Pending Promotions</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Categories</h2>
        </div>
        <div className="card-grid">
          {catalog.categories.map((cat) => (
            <div key={cat.name} className="card">
              <div className="card-title">{cat.name}</div>
              <div className="card-desc">{cat.description}</div>
              <div style={{ marginTop: 8 }}>
                <span className="badge badge-neutral">{cat.count} components</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

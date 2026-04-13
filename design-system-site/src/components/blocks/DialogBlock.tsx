import React from 'react';

export function DialogBlock() {
  return (
    <div style={{ position: 'relative', minHeight: 500 }}>
      {/* Dimmed background list page */}
      <div className="block-app-shell" style={{ filter: 'blur(1px)', opacity: 0.4 }}>
        <div className="block-sidebar-strip">
          <div className="block-sidebar-icon" style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 6 }} />
          <div className="block-sidebar-icon" />
          <div className="block-sidebar-icon active" />
          <div className="block-sidebar-icon" />
        </div>
        <div className="block-main-content">
          <div className="blk-breadcrumb">
            <span className="blk-breadcrumb-link">OMS</span>
            <span className="blk-breadcrumb-sep">/</span>
            <span>Orders</span>
          </div>
          <div className="blk-title-row">
            <h1 className="blk-page-title">Orders</h1>
          </div>
          <div className="blk-table">
            <div className="blk-table-head">
              <div className="blk-table-cell blk-cell-check"><div className="blk-checkbox" /></div>
              <div className="blk-table-cell blk-cell-id">Order ID</div>
              <div className="blk-table-cell blk-cell-adv">Advertiser</div>
              <div className="blk-table-cell blk-cell-status">Status</div>
              <div className="blk-table-cell blk-cell-budget">Budget</div>
              <div className="blk-table-cell blk-cell-date">Created</div>
              <div className="blk-table-cell blk-cell-actions" />
            </div>
            {[
              { id: 'ORD-2025-0847', adv: 'Moloco Inc.', status: 'Active', cls: 'success', budget: '$5,000', date: 'Jul 1' },
              { id: 'ORD-2025-0832', adv: 'Acme Corp', status: 'Paused', cls: 'warning', budget: '$2,400', date: 'Jun 28' },
              { id: 'ORD-2025-0819', adv: 'Globex Ltd.', status: 'Active', cls: 'success', budget: '$8,200', date: 'Jun 25' },
            ].map((row, i) => (
              <div className="blk-table-row" key={i}>
                <div className="blk-table-cell blk-cell-check"><div className="blk-checkbox" /></div>
                <div className="blk-table-cell blk-cell-id" style={{ color: 'var(--accent)' }}>{row.id}</div>
                <div className="blk-table-cell blk-cell-adv">{row.adv}</div>
                <div className="blk-table-cell blk-cell-status">
                  <span className={`blk-badge blk-badge-${row.cls}`}>{row.status}</span>
                </div>
                <div className="blk-table-cell blk-cell-budget">{row.budget}</div>
                <div className="blk-table-cell blk-cell-date">{row.date}</div>
                <div className="blk-table-cell blk-cell-actions" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dialog overlay */}
      <div className="blk-dialog-overlay">
        <div className="blk-dialog-card">
          <div className="blk-dialog-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="var(--danger)" strokeWidth="2" />
              <path d="M12 8v5M12 15.5v.5" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="blk-dialog-title">Delete Campaign?</h2>
          <p className="blk-dialog-desc">
            This will permanently delete <strong>Summer Campaign 2025</strong> and all associated data including creatives, targeting settings, and performance history. This action cannot be undone.
          </p>
          <div className="blk-dialog-actions">
            <button className="blk-btn blk-btn-ghost">Cancel</button>
            <button className="blk-btn blk-btn-danger">Delete Campaign</button>
          </div>
        </div>
      </div>
    </div>
  );
}

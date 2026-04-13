import React from 'react';

const rows = [
  { id: 'ORD-2025-0847', advertiser: 'Moloco Inc.', status: 'Active', statusClass: 'success', budget: '$5,000', created: 'Jul 1, 2025', actions: true },
  { id: 'ORD-2025-0832', advertiser: 'Acme Corp', status: 'Paused', statusClass: 'warning', budget: '$2,400', created: 'Jun 28, 2025', actions: true },
  { id: 'ORD-2025-0819', advertiser: 'Globex Ltd.', status: 'Active', statusClass: 'success', budget: '$8,200', created: 'Jun 25, 2025', actions: true },
  { id: 'ORD-2025-0801', advertiser: 'Initech', status: 'Draft', statusClass: 'neutral', budget: '$1,500', created: 'Jun 20, 2025', actions: true },
  { id: 'ORD-2025-0795', advertiser: 'Umbrella Co.', status: 'Completed', statusClass: 'info', budget: '$12,000', created: 'Jun 18, 2025', actions: true },
  { id: 'ORD-2025-0788', advertiser: 'Stark Industries', status: 'Active', statusClass: 'success', budget: '$3,750', created: 'Jun 15, 2025', actions: true },
  { id: 'ORD-2025-0774', advertiser: 'Wayne Enterprises', status: 'Paused', statusClass: 'warning', budget: '$6,100', created: 'Jun 12, 2025', actions: true },
  { id: 'ORD-2025-0761', advertiser: 'Cyberdyne Systems', status: 'Active', statusClass: 'success', budget: '$4,300', created: 'Jun 10, 2025', actions: true },
];

export function ListPageBlock() {
  return (
    <div className="block-app-shell">
      <div className="block-sidebar-strip">
        <div className="block-sidebar-icon" style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 6 }} />
        <div className="block-sidebar-icon" />
        <div className="block-sidebar-icon active" />
        <div className="block-sidebar-icon" />
        <div className="block-sidebar-icon" />
        <div className="block-sidebar-icon" />
      </div>
      <div className="block-main-content">
        {/* Breadcrumb */}
        <div className="blk-breadcrumb">
          <span className="blk-breadcrumb-link">OMS</span>
          <span className="blk-breadcrumb-sep">/</span>
          <span>Orders</span>
        </div>

        {/* Title row */}
        <div className="blk-title-row">
          <h1 className="blk-page-title">Orders</h1>
          <button className="blk-btn blk-btn-primary">+ Create Order</button>
        </div>

        {/* Tabs */}
        <div className="blk-tabs">
          <div className="blk-tab active">Available</div>
          <div className="blk-tab">All</div>
          <div className="blk-tab">Archived</div>
        </div>

        {/* Filter bar */}
        <div className="blk-filter-bar">
          <div className="blk-search-input">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span style={{ color: 'var(--text-muted)' }}>Search orders...</span>
          </div>
          <div className="blk-filter-select">
            <span>Status</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4" /></svg>
          </div>
          <div className="blk-filter-select">
            <span>Date range</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4" /></svg>
          </div>
        </div>

        {/* Data table */}
        <div className="blk-table">
          <div className="blk-table-head">
            <div className="blk-table-cell blk-cell-check"><div className="blk-checkbox" /></div>
            <div className="blk-table-cell blk-cell-id">Order ID</div>
            <div className="blk-table-cell blk-cell-adv">Advertiser</div>
            <div className="blk-table-cell blk-cell-status">Status</div>
            <div className="blk-table-cell blk-cell-budget">Budget</div>
            <div className="blk-table-cell blk-cell-date">Created</div>
            <div className="blk-table-cell blk-cell-actions">Actions</div>
          </div>
          {rows.map((row, i) => (
            <div className="blk-table-row" key={i}>
              <div className="blk-table-cell blk-cell-check"><div className="blk-checkbox" /></div>
              <div className="blk-table-cell blk-cell-id" style={{ fontWeight: 500, color: 'var(--accent)' }}>{row.id}</div>
              <div className="blk-table-cell blk-cell-adv">{row.advertiser}</div>
              <div className="blk-table-cell blk-cell-status">
                <span className={`blk-badge blk-badge-${row.statusClass}`}>{row.status}</span>
              </div>
              <div className="blk-table-cell blk-cell-budget">{row.budget}</div>
              <div className="blk-table-cell blk-cell-date">{row.created}</div>
              <div className="blk-table-cell blk-cell-actions" style={{ color: 'var(--text-muted)' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="4" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="12" cy="8" r="1.5"/></svg>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="blk-pagination">
          <span className="blk-pagination-info">Showing 1-8 of 24 orders</span>
          <div className="blk-pagination-btns">
            <button className="blk-page-btn" disabled>&lsaquo;</button>
            <button className="blk-page-btn active">1</button>
            <button className="blk-page-btn">2</button>
            <button className="blk-page-btn">3</button>
            <button className="blk-page-btn">&rsaquo;</button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React from 'react';

const timeline = [
  { time: 'Jul 1, 2025 09:12', text: 'Order created by admin@moloco.com', dot: 'var(--accent)' },
  { time: 'Jul 2, 2025 14:30', text: 'Budget updated from $3,000 to $5,000', dot: 'var(--accent)' },
  { time: 'Jul 5, 2025 11:45', text: 'Creative assets approved', dot: 'var(--success)' },
  { time: 'Jul 8, 2025 08:00', text: 'Campaign launched', dot: 'var(--success)' },
  { time: 'Jul 12, 2025 16:22', text: 'Performance report generated', dot: 'var(--text-muted)' },
];

export function DetailPageBlock() {
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
          <span className="blk-breadcrumb-link">Orders</span>
          <span className="blk-breadcrumb-sep">/</span>
          <span>ORD-2025-0847</span>
        </div>

        {/* Title row */}
        <div className="blk-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="blk-page-title">Summer Campaign 2025</h1>
            <span className="blk-badge blk-badge-success">Active</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="blk-btn blk-btn-ghost">Edit</button>
            <button className="blk-btn blk-btn-danger-ghost">Delete</button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="blk-stat-grid">
          <div className="blk-stat-card">
            <div className="blk-stat-label">Budget</div>
            <div className="blk-stat-value">$5,000</div>
            <div className="blk-stat-sub">Total allocated</div>
          </div>
          <div className="blk-stat-card">
            <div className="blk-stat-label">Spent</div>
            <div className="blk-stat-value">$3,247</div>
            <div className="blk-stat-sub" style={{ color: 'var(--success)' }}>64.9% of budget</div>
          </div>
          <div className="blk-stat-card">
            <div className="blk-stat-label">Impressions</div>
            <div className="blk-stat-value">124.5K</div>
            <div className="blk-stat-sub" style={{ color: 'var(--success)' }}>+12.3% vs last week</div>
          </div>
          <div className="blk-stat-card">
            <div className="blk-stat-label">CTR</div>
            <div className="blk-stat-value">2.31%</div>
            <div className="blk-stat-sub">Industry avg: 1.8%</div>
          </div>
        </div>

        {/* Two column layout */}
        <div className="blk-two-col">
          <div className="blk-panel">
            <div className="blk-panel-header">Campaign Details</div>
            <div className="blk-detail-list">
              {[
                ['Order ID', 'ORD-2025-0847'],
                ['Advertiser', 'Moloco Inc.'],
                ['Campaign Goal', 'Maximize conversions'],
                ['Start Date', 'Jul 1, 2025'],
                ['End Date', 'Aug 31, 2025'],
                ['Region', 'US, KR, JP'],
                ['Created By', 'admin@moloco.com'],
              ].map(([label, value]) => (
                <div className="blk-detail-row" key={label}>
                  <span className="blk-detail-label">{label}</span>
                  <span className="blk-detail-value">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="blk-panel">
            <div className="blk-panel-header">Activity</div>
            <div className="blk-timeline">
              {timeline.map((entry, i) => (
                <div className="blk-timeline-entry" key={i}>
                  <div className="blk-timeline-rail">
                    <div className="blk-timeline-dot" style={{ background: entry.dot }} />
                    {i < timeline.length - 1 && <div className="blk-timeline-line" />}
                  </div>
                  <div className="blk-timeline-body">
                    <div className="blk-timeline-text">{entry.text}</div>
                    <div className="blk-timeline-time">{entry.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

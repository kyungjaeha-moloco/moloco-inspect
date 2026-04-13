import React from 'react';

type Props = {
  isEdit?: boolean;
};

export function CreatePageBlock({ isEdit }: Props) {
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
          <span>{isEdit ? 'Edit Order' : 'New Order'}</span>
        </div>

        {/* Title */}
        <div className="blk-title-row">
          <h1 className="blk-page-title">{isEdit ? 'Edit Order' : 'Create Order'}</h1>
        </div>

        {/* Form panel: Basic Info */}
        <div className="blk-form-panel">
          <div className="blk-form-panel-header">Basic Info</div>
          <div className="blk-form-grid">
            <div className="blk-form-field">
              <label className="blk-form-label">Campaign Name <span className="blk-required">*</span></label>
              <input
                className="blk-form-input"
                type="text"
                readOnly
                value={isEdit ? 'Summer Campaign 2025' : ''}
                placeholder="Enter campaign name..."
              />
            </div>
            <div className="blk-form-field">
              <label className="blk-form-label">Campaign Goal <span className="blk-required">*</span></label>
              <div className="blk-form-select">
                <span style={{ color: isEdit ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {isEdit ? 'Maximize conversions' : 'Select a goal...'}
                </span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 6l4 4 4-4" /></svg>
              </div>
            </div>
            <div className="blk-form-field">
              <label className="blk-form-label">Budget <span className="blk-required">*</span></label>
              <div className="blk-form-input-wrap">
                <span className="blk-form-input-prefix">$</span>
                <input
                  className="blk-form-input blk-form-input-prefixed"
                  type="text"
                  readOnly
                  value={isEdit ? '5,000' : ''}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="blk-form-field blk-form-field-full">
              <label className="blk-form-label">Description</label>
              <textarea
                className="blk-form-textarea"
                readOnly
                value={isEdit ? 'Summer sale targeting returning users across US, KR, and JP markets. Focus on maximizing conversions with optimized bidding strategy.' : ''}
                placeholder="Optional description..."
              />
            </div>
          </div>
        </div>

        {/* Form panel: Targeting */}
        <div className="blk-form-panel">
          <div className="blk-form-panel-header">Targeting</div>
          <div className="blk-form-grid">
            <div className="blk-form-field">
              <label className="blk-form-label">Region</label>
              <div className="blk-form-tags-input">
                {isEdit ? (
                  <>
                    <span className="blk-tag">US <span className="blk-tag-x">&times;</span></span>
                    <span className="blk-tag">KR <span className="blk-tag-x">&times;</span></span>
                    <span className="blk-tag">JP <span className="blk-tag-x">&times;</span></span>
                  </>
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select regions...</span>
                )}
              </div>
            </div>
            <div className="blk-form-field">
              <label className="blk-form-label">Schedule</label>
              <div className="blk-form-date-range">
                <div className="blk-form-date">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="12" height="11" rx="1" />
                    <path d="M2 6h12M5 1v3M11 1v3" />
                  </svg>
                  <span>{isEdit ? 'Jul 1, 2025' : 'Start date'}</span>
                </div>
                <span style={{ color: 'var(--text-muted)' }}>&mdash;</span>
                <div className="blk-form-date">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="3" width="12" height="11" rx="1" />
                    <path d="M2 6h12M5 1v3M11 1v3" />
                  </svg>
                  <span>{isEdit ? 'Aug 31, 2025' : 'End date'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="blk-form-footer">
          <button className="blk-btn blk-btn-ghost">Cancel</button>
          <button className="blk-btn blk-btn-primary">
            {isEdit ? 'Save Changes' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import type { GovernanceJson } from '../types';

type Props = { data: GovernanceJson };

function QueueSection({ title, items, badgeClass }: { title: string; items: Array<{ name: string; reason?: string; migration?: string }>; badgeClass: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">{title}</h2>
        <span className={`badge ${badgeClass}`}>{items.length}</span>
      </div>
      <div className="queue-list">
        {items.map((item) => (
          <div key={item.name} className="queue-item">
            <span className="queue-item-name">{item.name}</span>
            <span className="queue-item-reason">
              {item.reason}
              {item.migration && <span style={{ display: 'block', marginTop: 2 }}>Migration: {item.migration}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GovernancePage({ data }: Props) {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Governance</h1>
        <p className="page-subtitle">Audit cycles, promotion and deprecation queues, and quality gates.</p>
      </div>

      {data.audit_cycle && (
        <div className="stat-row">
          {data.audit_cycle.last_audit && (
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: '1rem' }}>{data.audit_cycle.last_audit}</div>
              <div className="stat-label">Last Audit</div>
            </div>
          )}
          {data.audit_cycle.next_audit && (
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: '1rem' }}>{data.audit_cycle.next_audit}</div>
              <div className="stat-label">Next Audit</div>
            </div>
          )}
        </div>
      )}

      <QueueSection
        title="Promotion Queue"
        items={data.promotion_queue ?? []}
        badgeClass="badge-success"
      />
      <QueueSection
        title="Deprecation Queue"
        items={data.deprecation_queue ?? []}
        badgeClass="badge-warning"
      />
      <QueueSection
        title="Removal Queue"
        items={data.removal_queue ?? []}
        badgeClass="badge-danger"
      />
      <QueueSection
        title="Watch List"
        items={data.watch_list ?? []}
        badgeClass="badge-info"
      />

      {!data.promotion_queue?.length && !data.deprecation_queue?.length && !data.removal_queue?.length && !data.watch_list?.length && (
        <div className="empty-state">No governance items at this time.</div>
      )}
    </>
  );
}

import React from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { API_BASE } from '../analytics/types';
import { formatDuration, formatTimestamp, getStatusBadgeClass } from '../analytics/helpers';
import { useAnalyticsRequestDetail } from '../analytics/hooks';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function RequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const { detail, loading, error } = useAnalyticsRequestDetail(requestId);

  const req = detail?.request;
  const events = detail?.events ?? [];

  /* ---- Loading ---- */
  if (loading) {
    return (
      <>
        <div className="page-header">
          <NavLink className="btn btn-ghost link" to="/requests">&larr; Back to Requests</NavLink>
          <h1 className="page-title">Request Detail</h1>
        </div>
        <div className="loading-state">Loading request detail...</div>
      </>
    );
  }

  /* ---- Error ---- */
  if (error || !detail) {
    return (
      <>
        <div className="page-header">
          <NavLink className="btn btn-ghost link" to="/requests">&larr; Back to Requests</NavLink>
          <h1 className="page-title">Request Detail</h1>
        </div>
        <div className="error-state">{error ?? 'Request not found'}</div>
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <NavLink className="btn btn-ghost link" to="/requests">&larr; Back to Requests</NavLink>
        <h1 className="page-title">
          Request <span className="mono">{requestId ? requestId.slice(0, 12) : ''}</span>
        </h1>
        <p className="page-subtitle">{req?.request?.userPrompt || 'No prompt recorded'}</p>
      </div>

      {/* Stat cards */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">
            <span className={getStatusBadgeClass(req?.status ?? '')}>{req?.status ?? '\u2014'}</span>
          </div>
          <div className="stat-label">Status</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatDuration(req?.durationMs)}</div>
          <div className="stat-label">Duration</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{req?.changedFiles?.length ?? 0}</div>
          <div className="stat-label">Changed Files</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{req?.request?.client || '\u2014'}</div>
          <div className="stat-label">{req?.request?.pagePath || '/'}</div>
        </div>
      </div>

      {/* Two-column detail grid */}
      <div className="detail-grid">
        {/* Left: Request info */}
        <div className="detail-card">
          <h3 className="detail-card-title">Request</h3>
          <div className="detail-field">
            <div className="detail-field-label">User Prompt</div>
            <div className="detail-field-value">
              {req?.request?.userPrompt || '\u2014'}
            </div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Goal</div>
            <div className="detail-field-value">
              {req?.request?.requestContract?.goal || '\u2014'}
            </div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Change Intent</div>
            <div className="detail-field-value">
              {req?.request?.requestContract?.change_intent || '\u2014'}
            </div>
          </div>
          {req?.error && (
            <div className="detail-field">
              <div className="detail-field-label">Error</div>
              <div className="detail-field-value detail-code">{req.error}</div>
            </div>
          )}

          {/* AI Analysis */}
          {(req?.request as any)?.aiAnalysis && (
            <>
              <div className="detail-field" style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div className="detail-field-label">Agent Analysis</div>
                <div className="detail-field-value">
                  {(req?.request as any).aiAnalysis.understanding || '\u2014'}
                </div>
              </div>
              {(req?.request as any).aiAnalysis.analysis && (
                <div className="detail-field">
                  <div className="detail-field-label">Approach</div>
                  <div className="detail-field-value">
                    {(req?.request as any).aiAnalysis.analysis}
                  </div>
                </div>
              )}
              {Array.isArray((req?.request as any).aiAnalysis.steps) && (req?.request as any).aiAnalysis.steps.length > 0 && (
                <div className="detail-field">
                  <div className="detail-field-label">Execution Steps</div>
                  <div className="detail-field-value">
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      {(req?.request as any).aiAnalysis.steps.map((step: string, i: number) => (
                        <li key={i} style={{ marginBottom: 4 }}>{step}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
              {Array.isArray((req?.request as any).aiAnalysis.warnings) && (req?.request as any).aiAnalysis.warnings.length > 0 && (
                <div className="detail-field">
                  <div className="detail-field-label">Warnings</div>
                  <div className="detail-field-value" style={{ color: 'var(--warning)' }}>
                    {(req?.request as any).aiAnalysis.warnings.map((w: string, i: number) => (
                      <div key={i}>⚠ {w}</div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray((req?.request as any).aiAnalysis.successCriteria) && (req?.request as any).aiAnalysis.successCriteria.length > 0 && (
                <div className="detail-field">
                  <div className="detail-field-label">Success Criteria</div>
                  <div className="detail-field-value" style={{ color: 'var(--success)' }}>
                    {(req?.request as any).aiAnalysis.successCriteria.map((c: string, i: number) => (
                      <div key={i}>✓ {c}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: Artifacts */}
        <div className="detail-card">
          <h3 className="detail-card-title">Artifacts</h3>
          <div className="detail-field">
            <div className="detail-field-label">Review Changes</div>
            <div className="detail-field-value" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(req as any)?.livePreviewUrl && (
                <a className="link" href={(req as any).livePreviewUrl} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--accent)', color: '#fff', borderRadius: 6, fontWeight: 500, textDecoration: 'none' }}>
                  Live Preview &rarr;
                </a>
              )}
              {req?.previewUrl ? (
                <a className="link" href={req.previewUrl} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--accent-dim)', borderRadius: 6, fontWeight: 500, textDecoration: 'none' }}>
                  Diff Viewer &rarr;
                </a>
              ) : (
                '\u2014'
              )}
            </div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Modified Screen</div>
            <div className="detail-field-value">
              {req?.screenshotUrl ? (
                <img
                  alt="Modified screen preview"
                  src={`${API_BASE}${req.screenshotUrl}`}
                  style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => window.open(`${API_BASE}${req.screenshotUrl}`, '_blank')}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>No screenshot available yet</span>
              )}
            </div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Latest Log</div>
            <div className="detail-field-value detail-code">
              {req?.latestLog || '\u2014'}
            </div>
          </div>
        </div>
      </div>

      {/* Execution layer */}
      {req?.execution && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Execution Layer</h2>
          </div>
          <div className="detail-grid">
            <div className="detail-card">
              <div className="detail-field">
                <div className="detail-field-label">Layer</div>
                <div className="detail-field-value mono">{req.execution.layer || '\u2014'}</div>
              </div>
              <div className="detail-field">
                <div className="detail-field-label">Product</div>
                <div className="detail-field-value mono">{req.execution.productId || '\u2014'}</div>
              </div>
              <div className="detail-field">
                <div className="detail-field-label">Preview Adapter</div>
                <div className="detail-field-value mono">{req.execution.previewAdapterId || '\u2014'}</div>
              </div>
              <div className="detail-field">
                <div className="detail-field-label">Product Runner</div>
                <div className="detail-field-value mono">{req.execution.productRunnerId || '\u2014'}</div>
              </div>
            </div>
            <div className="detail-card">
              <div className="detail-field">
                <div className="detail-field-label">Repo Root</div>
                <div className="detail-field-value mono">{req.execution.repoRoot || '\u2014'}</div>
              </div>
              <div className="detail-field">
                <div className="detail-field-label">Worktree Base</div>
                <div className="detail-field-value mono">{req.execution.worktreeBase || '\u2014'}</div>
              </div>
              <div className="detail-field">
                <div className="detail-field-label">Worktree Path</div>
                <div className="detail-field-value mono">{req.execution.worktreePath || '\u2014'}</div>
              </div>
              <div className="detail-field">
                <div className="detail-field-label">Build Policy</div>
                <div className="detail-field-value">
                  <span className={req.execution.buildPolicyMatched ? 'badge badge-success' : 'badge badge-neutral'}>
                    {req.execution.buildPolicyMatched ? 'matched' : 'skipped'}
                  </span>
                </div>
              </div>
              <div className="detail-field">
                <div className="detail-field-label">Test Policy</div>
                <div className="detail-field-value">
                  <span className={req.execution.testPolicyMatched ? 'badge badge-success' : 'badge badge-neutral'}>
                    {req.execution.testPolicyMatched ? 'matched' : 'skipped'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Changed files list */}
      {req?.changedFiles && req.changedFiles.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Changed Files</h2>
            <span className="badge badge-neutral">{req.changedFiles.length}</span>
          </div>
          {req.changedFiles.map((file) => (
            <div className="detail-field" key={file}>
              <div className="detail-field-value mono">{file}</div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      {events.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h2 className="section-title">Timeline</h2>
          </div>
          <div className="timeline">
            {events.map((event, i) => (
              <div className="timeline-item" key={`${event.at}-${event.type}-${i}`}>
                <div className="timeline-time">{formatTimestamp(event.at)}</div>
                <div className="timeline-content">
                  <span className="timeline-label">{event.type}</span>
                  {(event.summary || event.phase || event.status) && (
                    <span> {event.summary || event.phase || event.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

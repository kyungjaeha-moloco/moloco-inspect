import React, { useState, useCallback } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { API_BASE } from '../analytics/types';
import { formatDuration, formatTimestamp, getStatusBadgeClass } from '../analytics/helpers';
import { useAnalyticsRequestDetail } from '../analytics/hooks';

function colorDiffLine(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'diff-add';
  if (line.startsWith('-') && !line.startsWith('---')) return 'diff-del';
  if (line.startsWith('@@')) return 'diff-hunk';
  if (line.startsWith('diff --git')) return 'diff-file';
  return '';
}

function DiffViewer({ diff, changedFiles }: { diff: string; changedFiles: string[] }) {
  const [expanded, setExpanded] = useState(true);
  const lines = diff.split('\n');
  const addCount = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length;
  const delCount = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;

  return (
    <div className="section">
      <div className="section-header" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <h2 className="section-title">Code Changes</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="badge badge-success" style={{ fontFamily: 'var(--font-mono)' }}>+{addCount}</span>
          <span className="badge badge-danger" style={{ fontFamily: 'var(--font-mono)' }}>-{delCount}</span>
          <span className="badge badge-neutral">{changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded ? '▼' : '▶'}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <pre style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7, overflowX: 'auto', maxHeight: 500, margin: 0, whiteSpace: 'pre', tabSize: 2 }}>
            {lines.map((line, i) => {
              const cls = colorDiffLine(line);
              return <div key={i} className={cls} style={cls ? { padding: '0 8px', margin: '0 -8px' } : undefined}>{line || '\u00A0'}</div>;
            })}
          </pre>
        </div>
      )}
    </div>
  );
}

function ApproveRejectActions({ requestId, status, onAction }: { requestId: string; status: string; onAction: () => void }) {
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleApprove = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/approve/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (data.ok !== false) {
        setActionResult({ type: 'approved', message: data.prUrl ? `PR created: ${data.prUrl}` : 'Approved — PR is being created' });
        onAction();
      } else {
        setActionResult({ type: 'error', message: data.error || 'Approval failed' });
      }
    } catch (e: any) {
      setActionResult({ type: 'error', message: e.message });
    }
    setLoading(false);
  }, [requestId, onAction]);

  const handleReject = useCallback(async () => {
    if (!feedback.trim()) return;
    setLoading(true);
    setShowFeedback(false);
    try {
      const res = await fetch(`${API_BASE}/api/reject/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback }) });
      const data = await res.json();
      if (data.ok !== false) {
        setActionResult({ type: 'rejected', message: 'Changes requested — agent is iterating' });
        setFeedback('');
        onAction();
      } else {
        setActionResult({ type: 'error', message: data.error || 'Rejection failed' });
      }
    } catch (e: any) {
      setActionResult({ type: 'error', message: e.message });
    }
    setLoading(false);
  }, [requestId, feedback, onAction]);

  if (actionResult) {
    return (
      <div className={`detail-field`} style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: actionResult.type === 'approved' ? 'rgba(36,161,72,0.08)' : actionResult.type === 'rejected' ? 'rgba(218,30,40,0.06)' : 'rgba(218,30,40,0.06)', border: `1px solid ${actionResult.type === 'approved' ? 'var(--success)' : 'var(--danger)'}` }}>
        <div style={{ fontWeight: 600, color: actionResult.type === 'approved' ? 'var(--success)' : actionResult.type === 'rejected' ? 'var(--danger)' : 'var(--danger)' }}>
          {actionResult.type === 'approved' ? '✓ ' : actionResult.type === 'rejected' ? '↻ ' : '✕ '}{actionResult.message}
        </div>
      </div>
    );
  }

  if (status !== 'preview') return null;

  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">Review Actions</h2>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <button className="btn btn-primary" onClick={handleApprove} disabled={loading} style={{ background: 'var(--success)', color: '#fff' }}>
          ✓ Approve &amp; Create PR
        </button>
        <button className="btn btn-outline" onClick={() => setShowFeedback(!showFeedback)} disabled={loading} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          ✕ Request Changes
        </button>
      </div>
      {showFeedback && (
        <div style={{ marginTop: 12 }}>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Describe what should be different..."
            style={{ width: '100%', minHeight: 80, padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-outline" onClick={() => setShowFeedback(false)} style={{ borderColor: 'var(--border)' }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleReject} disabled={!feedback.trim() || loading} style={{ background: 'var(--danger)', color: '#fff' }}>Submit Feedback</button>
          </div>
        </div>
      )}
    </div>
  );
}

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

      {/* Approve / Reject actions */}
      <ApproveRejectActions requestId={requestId || ''} status={req?.status || ''} onAction={() => window.location.reload()} />

      {/* Inline Diff Viewer */}
      {req?.diff && (
        <DiffViewer diff={req.diff} changedFiles={req?.changedFiles || []} />
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

      {/* Timeline — merge analytics events + log entries */}
      {(() => {
        const logEntries = (Array.isArray(req?.log) ? req.log : []).map((entry: any, i: number) => {
          const isObj = entry && typeof entry === 'object' && entry.at;
          return {
            at: isObj ? entry.at : '',
            type: 'log',
            summary: isObj ? entry.message : String(entry),
            _key: `log-${i}`,
          };
        });
        const analyticsEntries = events.map((event: any, i: number) => ({
          ...event,
          _key: `evt-${event.at}-${event.type}-${i}`,
        }));
        const merged = [...analyticsEntries, ...logEntries]
          .filter((e: any) => e.at)
          .sort((a: any, b: any) => new Date(a.at).getTime() - new Date(b.at).getTime());
        if (!merged.length) return null;
        return (
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Timeline</h2>
              <span className="badge badge-neutral">{merged.length}</span>
            </div>
            <div className="timeline">
              {merged.map((entry: any) => (
                <div className={`timeline-item${entry.type === 'log' ? ' timeline-log' : ''}`} key={entry._key}>
                  <div className="timeline-time">{formatTimestamp(entry.at)}</div>
                  <div className="timeline-content">
                    <span className={`timeline-label${entry.type === 'pipeline_error' ? ' badge-danger' : entry.type === 'log' ? ' badge-muted' : ''}`}>{entry.type}</span>
                    {(entry.summary || entry.phase || entry.status) && (
                      <span> {entry.summary || entry.phase || entry.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </>
  );
}

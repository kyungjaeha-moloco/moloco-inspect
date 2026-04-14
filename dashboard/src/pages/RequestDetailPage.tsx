import React, { useState, useCallback } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { API_BASE } from '../analytics/types';
import { formatDuration, formatTimestamp, getStatusBadgeClass } from '../analytics/helpers';
import { useAnalyticsRequestDetail } from '../analytics/hooks';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function colorDiffLine(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'diff-add';
  if (line.startsWith('-') && !line.startsWith('---')) return 'diff-del';
  if (line.startsWith('@@')) return 'diff-hunk';
  if (line.startsWith('diff --git')) return 'diff-file';
  return '';
}

function countDiffLines(diff: string) {
  const lines = diff.split('\n');
  return {
    add: lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length,
    del: lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length,
  };
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function RequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const { detail, loading, error } = useAnalyticsRequestDetail(requestId);
  const [diffExpanded, setDiffExpanded] = useState(true);
  const [timelineExpanded, setTimelineExpanded] = useState(true);
  const [feedbackText, setFeedbackText] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [actionResult, setActionResult] = useState<{ type: string; message: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const req = detail?.request;
  const events = detail?.events ?? [];
  const ai = (req?.request as any)?.aiAnalysis;
  const diff = req?.diff || '';
  const diffStats = diff ? countDiffLines(diff) : { add: 0, del: 0 };
  const changedFiles = req?.changedFiles || [];
  const isPreview = req?.status === 'preview';

  /* ---- Actions ---- */
  const handleApprove = useCallback(async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/approve/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      setActionResult(data.ok !== false
        ? { type: 'approved', message: data.prUrl ? `PR created: ${data.prUrl}` : 'Approved — PR is being created' }
        : { type: 'error', message: data.error || 'Failed' });
    } catch (e: any) { setActionResult({ type: 'error', message: e.message }); }
    setActionLoading(false);
  }, [requestId]);

  const handleReject = useCallback(async () => {
    if (!feedbackText.trim()) return;
    setActionLoading(true);
    setShowFeedback(false);
    try {
      const res = await fetch(`${API_BASE}/api/reject/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback: feedbackText }) });
      const data = await res.json();
      setActionResult(data.ok !== false
        ? { type: 'rejected', message: 'Changes requested — agent is iterating' }
        : { type: 'error', message: data.error || 'Failed' });
      setFeedbackText('');
    } catch (e: any) { setActionResult({ type: 'error', message: e.message }); }
    setActionLoading(false);
  }, [requestId, feedbackText]);

  /* ---- Loading / Error ---- */
  if (loading) return (
    <div className="rd-shell">
      <NavLink className="rd-back" to="/requests">&larr; Requests</NavLink>
      <div className="loading-state">Loading...</div>
    </div>
  );
  if (error || !detail) return (
    <div className="rd-shell">
      <NavLink className="rd-back" to="/requests">&larr; Requests</NavLink>
      <div className="error-state">{error ?? 'Request not found'}</div>
    </div>
  );

  /* ---- Timeline data ---- */
  const logEntries = (Array.isArray(req?.log) ? req.log : []).map((entry: any, i: number) => {
    const isObj = entry && typeof entry === 'object' && entry.at;
    return { at: isObj ? entry.at : '', type: 'log', summary: isObj ? entry.message : String(entry), _key: `log-${i}` };
  });
  const analyticsEntries = events.map((event: any, i: number) => ({ ...event, _key: `evt-${i}` }));
  const timeline = [...analyticsEntries, ...logEntries].filter((e: any) => e.at).sort((a: any, b: any) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="rd-shell">
      {/* ─── Top bar ─── */}
      <div className="rd-topbar">
        <NavLink className="rd-back" to="/requests">&larr; Requests</NavLink>
        <div className="rd-topbar-meta">
          <span className={getStatusBadgeClass(req?.status ?? '')}>{req?.status ?? '—'}</span>
          <span className="rd-meta-sep">·</span>
          <span className="rd-meta">{formatDuration(req?.durationMs)}</span>
          <span className="rd-meta-sep">·</span>
          <span className="rd-meta mono">{req?.request?.client || '—'}</span>
          <span className="rd-meta-sep">·</span>
          <span className="rd-meta mono" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{req?.request?.pagePath || '/'}</span>
        </div>
      </div>

      {/* ─── Request prompt (hero) ─── */}
      <div className="rd-prompt-card">
        <div className="rd-prompt-id">
          <span className="mono" style={{ opacity: 0.5 }}>{requestId?.slice(0, 8)}</span>
        </div>
        <div className="rd-prompt-text">{req?.request?.userPrompt || 'No prompt recorded'}</div>
        {req?.request?.requestContract?.goal && (
          <div className="rd-prompt-goal">Goal: {req.request.requestContract.goal}</div>
        )}
      </div>

      {/* ─── Two-column: AI Analysis + Preview/Screenshot ─── */}
      <div className="rd-two-col">
        {/* Left: AI Analysis */}
        <div className="rd-card">
          <div className="rd-card-header">
            <span className="rd-card-icon">&#9671;</span>
            Agent Analysis
          </div>
          {ai ? (
            <div className="rd-analysis">
              <div className="rd-analysis-understanding">{ai.understanding || '—'}</div>
              {ai.analysis && <div className="rd-analysis-approach">{ai.analysis}</div>}
              {Array.isArray(ai.steps) && ai.steps.length > 0 && (
                <div className="rd-steps">
                  <div className="rd-steps-label">Execution Steps</div>
                  {ai.steps.map((step: string, i: number) => (
                    <div className="rd-step" key={i}>
                      <span className="rd-step-num">{i + 1}</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              )}
              {ai.risks && (
                <div className="rd-risk">
                  <span className="rd-risk-icon">&#9888;</span> {ai.risks}
                </div>
              )}
              {ai.verification && (
                <div className="rd-verify">
                  <span className="rd-verify-icon">&#10003;</span> {ai.verification}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No AI analysis available</div>
          )}
        </div>

        {/* Right: Preview + Screenshot */}
        <div className="rd-card">
          <div className="rd-card-header">
            <span className="rd-card-icon">&#9673;</span>
            Preview
          </div>
          {/* Live Preview button — prominent */}
          {(req as any)?.livePreviewUrl && (
            (req as any)?.livePreviewExpired ? (
              <div className="rd-preview-expired">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><circle cx="8" cy="8" r="6"/><path d="M6 6l4 4M10 6l-4 4"/></svg>
                Sandbox expired — preview no longer available
              </div>
            ) : (
              <a className="rd-preview-btn" href={(req as any).livePreviewUrl} target="_blank" rel="noreferrer">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M6 3h7v7"/><path d="M13 3L6 10"/><path d="M11 9v4H3V5h4"/></svg>
                Open Live Preview
              </a>
            )
          )}
          {/* Screenshot */}
          {req?.screenshotUrl ? (
            <img
              className="rd-screenshot"
              alt="Modified screen"
              src={`${API_BASE}${req.screenshotUrl}`}
              onClick={() => window.open(`${API_BASE}${req.screenshotUrl}`, '_blank')}
            />
          ) : (
            <div className="rd-no-screenshot">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              <span>No screenshot captured</span>
            </div>
          )}
          {/* Changed files chips */}
          {changedFiles.length > 0 && (
            <div className="rd-files">
              {changedFiles.map((f) => (
                <span className="rd-file-chip" key={f}>{f}</span>
              ))}
            </div>
          )}
          {/* Error */}
          {req?.error && (
            <div className="rd-error-box">{req.error}</div>
          )}
        </div>
      </div>

      {/* ─── Code Changes (Diff) ─── */}
      {diff && (
        <div className="rd-card rd-full">
          <div className="rd-card-header rd-clickable" onClick={() => setDiffExpanded(!diffExpanded)}>
            <span>
              <span className="rd-card-icon">&#9998;</span>
              Code Changes
            </span>
            <div className="rd-diff-stats">
              <span className="rd-stat-add">+{diffStats.add}</span>
              <span className="rd-stat-del">-{diffStats.del}</span>
              <span className="badge badge-neutral">{changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''}</span>
              <span className="rd-chevron">{diffExpanded ? '▾' : '▸'}</span>
            </div>
          </div>
          {diffExpanded && (
            <pre className="rd-diff-pre">
              {diff.split('\n').map((line, i) => {
                const cls = colorDiffLine(line);
                return <div key={i} className={cls || undefined}>{line || '\u00A0'}</div>;
              })}
            </pre>
          )}
        </div>
      )}

      {/* ─── Sticky Action Bar ─── */}
      {(isPreview || actionResult) && (
        <div className="rd-action-bar">
          {actionResult ? (
            <div className={`rd-action-result rd-action-${actionResult.type}`}>
              {actionResult.type === 'approved' ? '✓ ' : actionResult.type === 'rejected' ? '↻ ' : '✕ '}
              {actionResult.message}
            </div>
          ) : (
            <>
              <button className="rd-btn rd-btn-approve" onClick={handleApprove} disabled={actionLoading}>
                ✓ Approve &amp; Create PR
              </button>
              <button className="rd-btn rd-btn-reject" onClick={() => setShowFeedback(!showFeedback)} disabled={actionLoading}>
                Request Changes
              </button>
              {(req as any)?.livePreviewUrl && (
                <a className="rd-btn rd-btn-preview" href={(req as any).livePreviewUrl} target="_blank" rel="noreferrer">
                  Live Preview ↗
                </a>
              )}
            </>
          )}
        </div>
      )}

      {/* Feedback dialog */}
      {showFeedback && (
        <div className="rd-feedback-overlay" onClick={() => setShowFeedback(false)}>
          <div className="rd-feedback-dialog" onClick={e => e.stopPropagation()}>
            <h3>Request Changes</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
              Describe what should be different. The agent will iterate on your feedback.
            </p>
            <textarea
              className="rd-feedback-input"
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="e.g., Move the button to the right side, change the color to blue..."
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="rd-btn rd-btn-ghost" onClick={() => setShowFeedback(false)}>Cancel</button>
              <button className="rd-btn rd-btn-reject" onClick={handleReject} disabled={!feedbackText.trim() || actionLoading}>
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Timeline (collapsed by default) ─── */}
      {timeline.length > 0 && (
        <div className="rd-card rd-full">
          <div className="rd-card-header rd-clickable" onClick={() => setTimelineExpanded(!timelineExpanded)}>
            <span>
              <span className="rd-card-icon">&#9201;</span>
              Timeline
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge badge-neutral">{timeline.length}</span>
              <span className="rd-chevron">{timelineExpanded ? '▾' : '▸'}</span>
            </div>
          </div>
          {timelineExpanded && (
            <div className="timeline" style={{ padding: '12px 20px 16px 40px' }}>
              {timeline.map((entry: any) => (
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
          )}
        </div>
      )}
    </div>
  );
}

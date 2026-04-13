import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3847';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type AnalyticsDetail = {
  request: {
    id: string;
    status: string;
    phase: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    durationMs?: number | null;
    approvalState?: string | null;
    previewUrl?: string | null;
    screenshotUrl?: string | null;
    changedFiles?: string[];
    latestLog?: string | null;
    error?: string | null;
    request?: {
      userPrompt?: string | null;
      pagePath?: string | null;
      client?: string | null;
      language?: string | null;
      requestContract?: {
        change_intent?: string | null;
        goal?: string | null;
      };
    };
    execution?: {
      layer?: string | null;
      productId?: string | null;
      previewAdapterId?: string | null;
      productRunnerId?: string | null;
      repoRoot?: string | null;
      worktreeBase?: string | null;
      worktreePath?: string | null;
      buildPolicyMatched?: boolean;
      testPolicyMatched?: boolean;
    };
  };
  events: Array<{
    at: string;
    type: string;
    summary?: string;
    status?: string;
    phase?: string;
  }>;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || Number.isNaN(ms) || ms <= 0) return '\u2014';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return remain ? `${minutes}m ${remain}s` : `${minutes}m`;
}

function getStatusBadgeClass(status: string): string {
  if (status === 'completed') return 'badge badge-success';
  if (status === 'error' || status === 'failed') return 'badge badge-danger';
  if (status === 'in-progress' || status === 'processing') return 'badge badge-info';
  return 'badge badge-neutral';
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

/* ------------------------------------------------------------------ */
/*  Data hook                                                          */
/* ------------------------------------------------------------------ */

function useAnalyticsRequestDetail(requestId: string | undefined) {
  const [detail, setDetail] = useState<AnalyticsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!requestId) {
      setDetail(null);
      setLoading(false);
      setError('Missing request id');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/request/${requestId}`);
      if (!res.ok) throw new Error(`Detail returned ${res.status}`);
      const json = await res.json();
      setDetail(json.detail ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detail fetch failed');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    let cancelled = false;
    if (!cancelled) void load();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return { detail, loading, error, reload: load };
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
        </div>

        {/* Right: Artifacts */}
        <div className="detail-card">
          <h3 className="detail-card-title">Artifacts</h3>
          <div className="detail-field">
            <div className="detail-field-label">Preview URL</div>
            <div className="detail-field-value">
              {req?.previewUrl ? (
                <a className="link" href={req.previewUrl} target="_blank" rel="noreferrer">
                  {req.previewUrl}
                </a>
              ) : (
                '\u2014'
              )}
            </div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Screenshot</div>
            <div className="detail-field-value">
              {req?.screenshotUrl ? (
                <>
                  <a
                    className="link"
                    href={`${API_BASE}${req.screenshotUrl}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open screenshot
                  </a>
                  <img
                    alt="Screenshot preview"
                    src={`${API_BASE}${req.screenshotUrl}`}
                    style={{ marginTop: 8, maxWidth: '100%', borderRadius: 6 }}
                  />
                </>
              ) : (
                '\u2014'
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

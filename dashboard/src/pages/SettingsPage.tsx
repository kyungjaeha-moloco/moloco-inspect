import React, { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3847';

/* ------------------------------------------------------------------ */
/*  Connection check                                                   */
/* ------------------------------------------------------------------ */

function useConnectionStatus() {
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(`${API_BASE}/api/analytics/summary`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        if (!cancelled) setApiReachable(res.ok);
      } catch {
        if (!cancelled) setApiReachable(false);
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return { apiReachable };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SettingsPage() {
  const { apiReachable } = useConnectionStatus();

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">System configuration and connection status</p>
      </div>

      {/* Connection Status */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Connection Status</h2>
        </div>
        <div className="settings-section">
          <div className="settings-row">
            <span className="settings-row-label">Orchestrator API</span>
            <span className="settings-row-value">
              <span
                className={
                  apiReachable === null
                    ? 'connection-dot'
                    : apiReachable
                      ? 'connection-dot connected'
                      : 'connection-dot disconnected'
                }
              />
              {apiReachable === null
                ? 'Checking...'
                : apiReachable
                  ? 'Connected'
                  : 'Unreachable'}
              <span className="mono" style={{ marginLeft: 8, opacity: 0.6 }}>
                {API_BASE}
              </span>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Docker Sandbox</span>
            <span className="settings-row-value">
              <span className="connection-dot connected" />
              Configured
            </span>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">System Info</h2>
        </div>
        <div className="settings-section">
          <div className="settings-row">
            <span className="settings-row-label">Dashboard Version</span>
            <span className="settings-row-value mono">0.1.0</span>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">API Base URL</span>
            <span className="settings-row-value mono">{API_BASE}</span>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Auto-refresh Interval</span>
            <span className="settings-row-value mono">30s</span>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Quick Links</h2>
        </div>
        <div className="settings-section">
          <div className="settings-row">
            <span className="settings-row-label">Documentation</span>
            <span className="settings-row-value">
              <a
                className="link"
                href="https://github.com/user/moloco-inspect"
                target="_blank"
                rel="noreferrer"
              >
                Project Repository
              </a>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Design System</span>
            <span className="settings-row-value">
              <span style={{ opacity: 0.5 }}>Coming soon</span>
            </span>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">Chrome Extension</span>
            <span className="settings-row-value">
              <a
                className="link"
                href="chrome://extensions"
                target="_blank"
                rel="noreferrer"
              >
                Manage Extensions
              </a>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

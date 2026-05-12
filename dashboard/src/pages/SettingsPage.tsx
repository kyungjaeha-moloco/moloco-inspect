import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_VERSION } from '../constants';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3847';

/* ------------------------------------------------------------------ */
/*  Molly settings (runtime-mutable)                                     */
/* ------------------------------------------------------------------ */

interface MollySettings {
  classifierModel: string;
  chatModel: string;
  statusModel: string;
  prdModel: string;
  planModel: string;
  prdThinkingBudget: number;
  planThinkingBudget: number;
  researchEnabled: boolean;
  researchParallelism: number;
  researchQueryTimeoutMs: number;
  researchAggregateTimeoutMs: number;
}

interface MollySettingsResponse {
  ok: boolean;
  models: string[];
  defaults: MollySettings;
  current: MollySettings;
}

function MollySettingsPanel() {
  const [data, setData] = useState<MollySettingsResponse | null>(null);
  const [draft, setDraft] = useState<MollySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/molly/settings`);
      const d: MollySettingsResponse = await res.json();
      if (!d.ok) throw new Error('failed to load');
      setData(d);
      setDraft(d.current);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    return (Object.keys(draft) as (keyof MollySettings)[]).some(
      (k) => draft[k] !== data.current[k],
    );
  }, [data, draft]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/molly/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setData(d);
      setDraft(d.current);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    if (data) setDraft(data.defaults);
  }

  if (!data || !draft) {
    return (
      <div className="settings-section">
        <div className="settings-row">
          <span className="settings-row-label">Loading…</span>
        </div>
      </div>
    );
  }

  const modelOpts = data.models.map((m) => (
    <option key={m} value={m}>{prettyModel(m)}</option>
  ));

  return (
    <div className="settings-section" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          padding: '10px 12px',
          background: 'var(--bg-base)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}
      >
        <strong>Model selection</strong> — determines which LLM handles each stage. Haiku 4.5 = fastest and cheapest (~$1/M tokens),
        Sonnet 4 = more accurate but ~3× more expensive and ~3× slower (~$3/M tokens).
        <br />
        <strong>Thinking budget</strong> — number of tokens the AI uses to reason *internally* before responding. 0 = immediate answer.
        2048 = ~2,000 tokens of reasoning before answering. The thinking content is not visible to users but affects answer quality.
      </div>
      <SettingsSelect
        label="Classifier model"
        hint="First stage for all inputs — classifies as chat / status / lifecycle / code_change. Called on every request so speed matters. Haiku recommended (switching to Sonnet adds +1-2s per input)."
        value={draft.classifierModel}
        onChange={(v) => setDraft({ ...draft, classifierModel: v })}
        options={modelOpts}
      />
      <SettingsSelect
        label="Chat model"
        hint="Handles greetings, introductions, usage guidance, and questions about Molly's capabilities. Patterns are simple so Haiku is sufficient (maintains persona tone). Switching to Sonnet may produce more natural responses but costs ~3× more."
        value={draft.chatModel}
        onChange={(v) => setDraft({ ...draft, chatModel: v })}
        options={modelOpts}
      />
      <SettingsSelect
        label="Status model"
        hint='Answers job status queries like "how many active jobs?" or "what happened to the one I created yesterday?". Summarizes job data in natural language. Simple task — Haiku recommended.'
        value={draft.statusModel}
        onChange={(v) => setDraft({ ...draft, statusModel: v })}
        options={modelOpts}
      />
      <SettingsSelect
        label="PRD analyzer model"
        hint="Evaluates PRD clarity and generates follow-up questions when ambiguous. Requires nuanced judgment (where / what / how) so Sonnet recommended. Haiku works but missingInfo accuracy is lower."
        value={draft.prdModel}
        onChange={(v) => setDraft({ ...draft, prdModel: v })}
        options={modelOpts}
      />
      <SettingsSelect
        label="Plan emitter model"
        hint="Generates plan items from DS context (patterns / api-contracts / schema). Heaviest stage (input ~71K tokens). Sonnet recommended. Opus improves accuracy further but costs 5×."
        value={draft.planModel}
        onChange={(v) => setDraft({ ...draft, planModel: v })}
        options={modelOpts}
      />
      <SettingsSlider
        label="PRD thinking budget"
        hint='Reasoning depth for "is this PRD clear?" judgment. 0 = immediate answer (simple follow-up when ambiguous). 2048 (default) = richer follow-up candidates ("which ad page? creation / management / detail, etc."). 4096 = longer and more specific. Enabling adds latency +5-10s, cost +40-60%.'
        value={draft.prdThinkingBudget}
        onChange={(v) => setDraft({ ...draft, prdThinkingBudget: v })}
        min={0}
        max={4096}
        step={512}
      />
      <SettingsSlider
        label="Plan thinking budget"
        hint='Reasoning depth for "which patterns / files / order?" when building a plan. 0 = immediate answer (default). 2048 = better pattern_id matching, more accurate target_file (template form → inferred real file). 4096 = refined depends_on graph. Enabling adds latency +5-10s during plan generation.'
        value={draft.planThinkingBudget}
        onChange={(v) => setDraft({ ...draft, planThinkingBudget: v })}
        min={0}
        max={4096}
        step={512}
      />

      {/* ── Research (Type-1, plan 2026-05-12-research-parallelism.md) ── */}
      <div
        style={{
          marginTop: 16,
          padding: '10px 12px',
          background: 'var(--bg-base)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 'var(--text-xs)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}
      >
        <strong>Research (Type-1)</strong> — read-only research sub-agents that run before each task's
        coder adapter. They search the codebase / design system / API contracts in parallel and pass
        the synthesised bundle into the coder's prompt. Slice F-lite found that <span className="mono">researchParallelism=5</span>
        was 6.6× faster than <span className="mono">1</span> at identical cost.
      </div>
      <SettingsToggle
        label="Research enabled"
        hint="Master switch for the research step. When off, the runner passes null to the coder adapter (legacy behaviour). When on, each task fires up to `researchParallelism` Claude Code subprocesses before the coder runs."
        value={draft.researchEnabled}
        onChange={(v) => setDraft({ ...draft, researchEnabled: v })}
      />
      <SettingsSlider
        label="Research parallelism"
        hint="How many read-only Claude Code subprocesses dispatch concurrently per task. 5 = fastest (Slice F-lite measured); 2-3 = safer on tight Anthropic ITPM tiers; 1 = sequential. Hard-capped at 5 because the query-builder emits at most 5 questions per task."
        value={draft.researchParallelism}
        onChange={(v) => setDraft({ ...draft, researchParallelism: v })}
        min={1}
        max={5}
        step={1}
      />
      <SettingsSlider
        label="Per-query timeout (s)"
        hint="Wall-clock budget for each research subprocess. After this, SIGTERM is sent; SIGKILL follows 3 s later. Empirical codebase-exploration takes ~100-160 s — keep at 180 unless you measure something faster."
        value={Math.round(draft.researchQueryTimeoutMs / 1000)}
        onChange={(v) => setDraft({ ...draft, researchQueryTimeoutMs: v * 1000 })}
        min={30}
        max={600}
        step={30}
      />
      <SettingsSlider
        label="Aggregate timeout (s)"
        hint="Wall-clock cap across all queries for one task. When it fires, in-flight queries are aborted and surfaced as 'timeout' in the bundle. Sized for parallelism=1 to still finish 5 sequential queries (~800 s worst case)."
        value={Math.round(draft.researchAggregateTimeoutMs / 1000)}
        onChange={(v) => setDraft({ ...draft, researchAggregateTimeoutMs: v * 1000 })}
        min={60}
        max={3600}
        step={60}
      />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <button
          className="btn btn-primary"
          onClick={() => void save()}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
        <button
          className="btn"
          onClick={reset}
          disabled={saving}
          title="Revert to env boot defaults (takes effect on save)"
        >
          Reset to env defaults
        </button>
        <button
          className="btn"
          onClick={() => void refresh()}
          disabled={saving}
        >
          Reload
        </button>
        {error && <span style={{ color: 'crimson', marginLeft: 8 }}>⚠️ {error}</span>}
        {savedAt && !dirty && (
          <span style={{ opacity: 0.6, fontSize: 12, marginLeft: 8 }}>
            Saved ({Math.floor((Date.now() - savedAt) / 1000)}s ago)
          </span>
        )}
      </div>
      <div style={{ opacity: 0.55, fontSize: 12, lineHeight: 1.5 }}>
        Changes apply immediately to the next call (no orchestrator restart needed). Persisted to
        <span className="mono"> orchestrator/state/molly-settings.json</span>.
        Env vars (<span className="mono">MOLLY_*_MODEL</span>,
        <span className="mono"> MOLLY_PRD_THINKING</span>,
        <span className="mono"> MOLLY_PLAN_THINKING</span>) only set the boot defaults.
      </div>
    </div>
  );
}

function prettyModel(m: string) {
  if (m.includes('haiku-4-5')) return 'Haiku 4.5 (fast, cheap)';
  if (m.includes('sonnet-4-5')) return 'Sonnet 4.5';
  if (m.includes('sonnet-4-202505')) return 'Sonnet 4 (default)';
  if (m.includes('opus-4-5')) return 'Opus 4.5';
  if (m.includes('opus-4-7')) return 'Opus 4.7';
  return m;
}

function SettingsSelect({
  label, hint, value, onChange, options,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  options: React.ReactNode;
}) {
  return (
    <div className="settings-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
      <div style={{ minWidth: 180 }}>
        <div className="settings-row-label">{label}</div>
        <div style={{ opacity: 0.55, fontSize: 12 }}>{hint}</div>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mono"
        style={{ padding: '6px 8px', minWidth: 280 }}
      >
        {options}
      </select>
    </div>
  );
}

function SettingsToggle({
  label, hint, value, onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="settings-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
      <div style={{ minWidth: 180 }}>
        <div className="settings-row-label">{label}</div>
        <div style={{ opacity: 0.55, fontSize: 12 }}>{hint}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 280 }}>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
            style={{ transform: 'scale(1.2)' }}
          />
          <span className="mono">{value ? 'on' : 'off'}</span>
        </label>
      </div>
    </div>
  );
}

function SettingsSlider({
  label, hint, value, onChange, min, max, step,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <div className="settings-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
      <div style={{ minWidth: 180 }}>
        <div className="settings-row-label">{label}</div>
        <div style={{ opacity: 0.55, fontSize: 12 }}>{hint}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 280 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span className="mono" style={{ minWidth: 60, textAlign: 'right' }}>
          {value === 0 ? 'off' : value}
        </span>
      </div>
    </div>
  );
}

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

      {/* Molly settings */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Molly Settings</h2>
          <span style={{ opacity: 0.55, fontSize: 12, marginLeft: 12 }}>
            model / thinking budget — changes apply immediately
          </span>
        </div>
        <MollySettingsPanel />
      </div>

      {/* System Info */}
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">System Info</h2>
        </div>
        <div className="settings-section">
          <div className="settings-row">
            <span className="settings-row-label">Dashboard Version</span>
            <span className="settings-row-value mono">{APP_VERSION}</span>
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
              <span className="mono" style={{ opacity: 0.6 }}>
                Type chrome://extensions in your address bar
              </span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

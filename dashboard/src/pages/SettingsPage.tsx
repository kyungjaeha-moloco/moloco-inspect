import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_VERSION } from '../constants';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3847';

/* ------------------------------------------------------------------ */
/*  Molly settings (런타임 변경)                                         */
/* ------------------------------------------------------------------ */

interface MollySettings {
  classifierModel: string;
  chatModel: string;
  statusModel: string;
  prdModel: string;
  planModel: string;
  prdThinkingBudget: number;
  planThinkingBudget: number;
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
        <strong>모델 선택</strong> — 각 단계가 어떤 LLM 으로 처리될지 결정. Haiku 4.5 = 가장 빠르고 저렴 (~$1/M tokens),
        Sonnet 4 = 더 정확하지만 ~3× 비싸고 ~3× 느림 (~$3/M tokens).
        <br />
        <strong>thinking budget</strong> — AI 가 답하기 전에 *내부적으로* 생각하는 토큰 수. 0 = 즉답.
        2048 = 약 2000 토큰만큼 추론 후 답. 사용자에게 thinking 내용은 안 보이지만 답변 품질에 영향.
      </div>
      <SettingsSelect
        label="Classifier 모델"
        hint="모든 입력의 첫 단계 — chat / status / lifecycle / code_change 분류. 매 호출 거치므로 속도 중요. Haiku 권장 (Sonnet 으로 바꾸면 매 입력마다 +1-2s 추가)."
        value={draft.classifierModel}
        onChange={(v) => setDraft({ ...draft, classifierModel: v })}
        options={modelOpts}
      />
      <SettingsSelect
        label="Chat 모델"
        hint="인사 / 자기소개 / 사용법 안내 / molly 능력 질의 응답. 패턴이 단순해 Haiku 로 충분 (페르소나 톤 유지). Sonnet 으로 바꾸면 답변이 더 자연스러울 수 있지만 비용 ~3× ↑."
        value={draft.chatModel}
        onChange={(v) => setDraft({ ...draft, chatModel: v })}
        options={modelOpts}
      />
      <SettingsSelect
        label="Status 모델"
        hint='"활성 잡 몇 개?", "어제 만든 거 어떻게 됐어?" 같은 잡 상태 질의 응답. 잡 데이터를 자연어로 요약. 단순한 작업이라 Haiku 권장.'
        value={draft.statusModel}
        onChange={(v) => setDraft({ ...draft, statusModel: v })}
        options={modelOpts}
      />
      <SettingsSelect
        label="PRD analyzer 모델"
        hint="PRD 가 명확한지 판단 + 모호하면 후속 Q 생성. 미묘한 판단 (어디 / 무엇 / 어떻게) 필요해 Sonnet 권장. Haiku 도 동작하지만 missingInfo 정확도 ↓."
        value={draft.prdModel}
        onChange={(v) => setDraft({ ...draft, prdModel: v })}
        options={modelOpts}
      />
      <SettingsSelect
        label="Plan emitter 모델"
        hint="DS (patterns / api-contracts / schema) 기반으로 plan items 생성. 가장 무거운 단계 (input ~71K tokens). Sonnet 권장. Opus 로 정확도 ↑↑ 가능 (단 비용 5×)."
        value={draft.planModel}
        onChange={(v) => setDraft({ ...draft, planModel: v })}
        options={modelOpts}
      />
      <SettingsSlider
        label="PRD thinking budget"
        hint='"이 PRD 가 명확한가?" 판단 시 깊이. 0 = 즉답 (모호 시 단순 후속 Q). 2048 (default) = 후속 Q 가 후보를 풍부히 제시 ("어떤 광고 페이지? 광고 생성 / 관리 / 상세 등"). 4096 = 더 길고 구체. 켜면 latency +5-10s, 비용 +40-60%.'
        value={draft.prdThinkingBudget}
        onChange={(v) => setDraft({ ...draft, prdThinkingBudget: v })}
        min={0}
        max={4096}
        step={512}
      />
      <SettingsSlider
        label="Plan thinking budget"
        hint='Plan 만들 때 "어떤 패턴 / 파일 / 순서?" 추론 깊이. 0 = 즉답 (default). 2048 = pattern_id 매칭 정확도 ↑, target_file 더 정확 (template form → 실제 파일 추론). 4096 = depends_on 그래프까지 정교. 켜면 plan 생성 시 latency +5-10s.'
        value={draft.planThinkingBudget}
        onChange={(v) => setDraft({ ...draft, planThinkingBudget: v })}
        min={0}
        max={4096}
        step={512}
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
          title="env 부팅 default 로 되돌림 (저장 누르면 적용)"
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
            저장됨 ({Math.floor((Date.now() - savedAt) / 1000)}s 전)
          </span>
        )}
      </div>
      <div style={{ opacity: 0.55, fontSize: 12, lineHeight: 1.5 }}>
        변경 즉시 다음 호출부터 반영 (orchestrator 재시작 X). 영구 저장은
        <span className="mono"> orchestrator/state/molly-settings.json</span>.
        env 변수 (<span className="mono">MOLLY_*_MODEL</span>,
        <span className="mono"> MOLLY_PRD_THINKING</span>,
        <span className="mono"> MOLLY_PLAN_THINKING</span>) 는 부팅 default 만 결정.
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
            모델 / thinking budget — 변경 즉시 반영
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

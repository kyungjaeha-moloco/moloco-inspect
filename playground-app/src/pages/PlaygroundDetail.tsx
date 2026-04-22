/**
 * Playground detail — 2-pane editor at `/p/:id`.
 *
 * Layout (v3 plan §6, revised for inline timeline):
 *   ┌───────────────┬────────────────────────────────┐
 *   │ 대화 (320px)   │   Live iframe + 모드 토글      │
 *   │ (타임라인 내장)│                                │
 *   └───────────────┴────────────────────────────────┘
 *
 * The separate bottom Timeline bar from the original v3 sketch was
 * replaced with per-execution rewind buttons inside the chat (see
 * AIPanel.ExecutionCard). The conversation itself is the timeline.
 * A top-strip banner appears while the playground is checked out to
 * an older commit — it's the one surface where we surface "time-travel"
 * outside the scrollable chat.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getPlayground,
  restorePlaygroundHead,
} from '../services/orchestrator-client';
import {
  usePlaygroundStore,
  type IframeMode,
} from '../store/playground-store';
import { LivePreview } from '../editor/LivePreview';
import { AIPanel } from '../editor/AIPanel';

export function PlaygroundDetail() {
  const { id } = useParams<{ id: string }>();
  const current = usePlaygroundStore((s) => s.current);
  const mode = usePlaygroundStore((s) => s.mode);
  const setCurrent = usePlaygroundStore((s) => s.setCurrent);
  const mergeCurrent = usePlaygroundStore((s) => s.mergeCurrent);
  const setMode = usePlaygroundStore((s) => s.setMode);
  const reset = usePlaygroundStore((s) => s.reset);

  // Orchestrator is authoritative for playground state (status, ports,
  // HEAD sha). Refetch on mount so we always render the current vitePort
  // — spike addendum A2: ports can change after resume.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPlayground(id)
      .then((pg) => {
        if (!cancelled) setCurrent(pg);
      })
      .catch((err) => {
        console.error('[PlaygroundDetail] getPlayground failed', err);
      });
    return () => {
      cancelled = true;
      reset();
    };
  }, [id, setCurrent, reset]);

  const [reloadNonce, setReloadNonce] = useState(0);
  const handleReload = () => setReloadNonce((n) => n + 1);

  const handleRestoreHead = async () => {
    if (!id) return;
    try {
      const pg = await restorePlaygroundHead(id);
      mergeCurrent(pg);
    } catch (err) {
      console.error('[PlaygroundDetail] restore head failed', err);
    }
  };

  if (!id) {
    return <div style={{ padding: 24 }}>playground id가 없습니다.</div>;
  }

  if (!current || current.id !== id) {
    return <div style={{ padding: 24 }}>로딩 중… ({id})</div>;
  }

  return (
    <div style={rootStyle}>
      <Header playground={current} />
      {current.checkedOutSha && (
        <TimeTravelBanner
          sha={current.checkedOutSha}
          onRestoreHead={handleRestoreHead}
        />
      )}
      <div style={twoPaneStyle}>
        <aside style={leftPaneStyle}>
          <AIPanel />
        </aside>
        <main style={rightPaneStyle}>
          <ModeToolbar mode={mode} onChange={setMode} onReload={handleReload} />
          <div style={previewAreaStyle}>
            <LivePreview
              playground={current}
              mode={mode}
              reloadNonce={reloadNonce}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function Header({
  playground,
}: {
  playground: {
    id: string;
    title: string;
    status: string;
    headCommitSha?: string;
    vitePort?: number;
  };
}) {
  return (
    <header style={headerStyle}>
      <Link
        to="/"
        aria-label="Playground 목록으로"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          fontSize: 16,
        }}
      >
        ←
      </Link>
      <div style={{ marginLeft: 8, flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {playground.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            marginTop: 2,
          }}
        >
          <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
            {playground.id}
          </code>
          {' · '}
          <StatusDot status={playground.status} />
          {playground.status}
          {playground.headCommitSha && (
            <>
              {' · '}
              <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                {playground.headCommitSha.slice(0, 7)}
              </code>
            </>
          )}
          {playground.vitePort ? ` · :${playground.vitePort}` : ''}
        </div>
      </div>
    </header>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'var(--success)'
      : status === 'crashed'
        ? 'var(--error)'
        : 'var(--text-tertiary)';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        marginRight: 4,
        verticalAlign: 'middle',
      }}
    />
  );
}

function TimeTravelBanner({
  sha,
  onRestoreHead,
}: {
  sha: string;
  onRestoreHead: () => void;
}) {
  return (
    <div style={bannerStyle}>
      <span>
        🕐 <strong>시간 여행 중</strong> — {sha.slice(0, 7)} 으로 checkout됨. 새 요청을
        하려면 최신으로 복귀해야 합니다.
      </span>
      <button onClick={onRestoreHead} style={bannerButtonStyle}>
        최신으로 복귀 →
      </button>
    </div>
  );
}

interface ModeToolbarProps {
  mode: IframeMode;
  onChange: (mode: IframeMode) => void;
  onReload: () => void;
}

function ModeToolbar({ mode, onChange, onReload }: ModeToolbarProps) {
  const modes: Array<{ value: IframeMode; label: string; hint: string }> = [
    { value: 'view', label: '🔒 View', hint: '클릭 차단 · 스크롤만 프록시' },
    { value: 'pick', label: '🖱 Pick', hint: '요소 선택 (M3)' },
    { value: 'pin', label: '📍 Pin', hint: '좌표 클릭해 핀 코멘트' },
  ];
  return (
    <div style={toolbarStyle}>
      {modes.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(m.value)}
          title={m.hint}
          style={{
            ...modeButtonStyle,
            background: mode === m.value ? 'var(--text-primary)' : 'var(--bg-elevated)',
            color: mode === m.value ? 'var(--text-inverse)' : 'var(--text-primary)',
            borderColor: mode === m.value ? 'var(--text-primary)' : 'var(--border-primary)',
          }}
        >
          {m.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onReload}
        title="iframe 강제 새로고침 (HMR 놓친 경우)"
        style={{
          ...modeButtonStyle,
          marginLeft: 'auto',
          background: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
        }}
      >
        🔄 Reload
      </button>
    </div>
  );
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100vw',
  height: '100vh',
  overflow: 'hidden',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 16px',
  borderBottom: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
};

const twoPaneStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
};

const leftPaneStyle: React.CSSProperties = {
  width: 320,
  borderRight: '1px solid var(--border-primary)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: 'var(--bg-primary)',
};

const rightPaneStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
};

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '8px 12px',
  borderBottom: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
};

const modeButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const previewAreaStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  background: 'var(--bg-secondary)',
};

const bannerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 16px',
  background: 'var(--warning-light)',
  borderBottom: '1px solid var(--warning)',
  color: 'var(--text-primary)',
  fontSize: 12,
};

const bannerButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--accent)',
  color: 'var(--text-inverse)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

const AIPANEL_WIDTH_STORAGE_KEY = 'playground-app.aipanel-width';
const AIPANEL_WIDTH_MIN = 280;
const AIPANEL_WIDTH_MAX = 720;
const AIPANEL_WIDTH_DEFAULT = 360;
import {
  getPlayground,
  promotePlayground,
  restorePlaygroundHead,
  type PromoteResult,
} from '../services/orchestrator-client';
import {
  usePlaygroundStore,
  type IframeMode,
} from '../store/playground-store';
import { LivePreview } from '../editor/LivePreview';
import { AIPanel } from '../editor/AIPanel';

type PromoteStage =
  | { kind: 'idle' }
  | { kind: 'confirm'; dryRun: boolean }
  | { kind: 'running'; dryRun: boolean }
  | { kind: 'done'; result: PromoteResult }
  | { kind: 'error'; message: string; dryRun: boolean };

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

  const [leftPaneWidth, setLeftPaneWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return AIPANEL_WIDTH_DEFAULT;
    const raw = window.localStorage.getItem(AIPANEL_WIDTH_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed)) return AIPANEL_WIDTH_DEFAULT;
    return Math.min(AIPANEL_WIDTH_MAX, Math.max(AIPANEL_WIDTH_MIN, parsed));
  });
  const draggingRef = useRef(false);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    const root = document.body;
    const prevCursor = root.style.cursor;
    const prevSelect = root.style.userSelect;
    root.style.cursor = 'col-resize';
    root.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(
        AIPANEL_WIDTH_MAX,
        Math.max(AIPANEL_WIDTH_MIN, ev.clientX),
      );
      setLeftPaneWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      root.style.cursor = prevCursor;
      root.style.userSelect = prevSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      AIPANEL_WIDTH_STORAGE_KEY,
      String(leftPaneWidth),
    );
  }, [leftPaneWidth]);

  const [promote, setPromote] = useState<PromoteStage>({ kind: 'idle' });

  const handlePromoteOpen = () =>
    setPromote({ kind: 'confirm', dryRun: true });
  const handlePromoteCancel = () => setPromote({ kind: 'idle' });

  const handlePromoteRun = async (dryRun: boolean) => {
    if (!id) return;
    setPromote({ kind: 'running', dryRun });
    try {
      const result = await promotePlayground(id, { dryRun });
      mergeCurrent(result.playground);
      setPromote({ kind: 'done', result });
    } catch (err) {
      console.error('[PlaygroundDetail] promote failed', err);
      const message =
        err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다';
      setPromote({ kind: 'error', message, dryRun });
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
      <Header
        playground={current}
        onPromote={handlePromoteOpen}
        promoteDisabled={
          !!current.checkedOutSha || promote.kind === 'running'
        }
      />
      {current.checkedOutSha && (
        <TimeTravelBanner
          sha={current.checkedOutSha}
          onRestoreHead={handleRestoreHead}
        />
      )}
      <div style={twoPaneStyle}>
        <aside style={{ ...leftPaneStyle, width: leftPaneWidth }}>
          <AIPanel />
        </aside>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="AIPanel 너비 조절"
          onPointerDown={handleResizeStart}
          style={resizerStyle}
        >
          <div style={resizerGripStyle} aria-hidden />
        </div>
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
      {promote.kind !== 'idle' && (
        <PromoteDialog
          stage={promote}
          onCancel={handlePromoteCancel}
          onRun={handlePromoteRun}
        />
      )}
    </div>
  );
}

function Header({
  playground,
  onPromote,
  promoteDisabled,
}: {
  playground: {
    id: string;
    title: string;
    status: string;
    headCommitSha?: string;
    vitePort?: number;
    promotedPrUrl?: string;
    promotedBranch?: string;
  };
  onPromote: () => void;
  promoteDisabled: boolean;
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {playground.promotedPrUrl ? (
          <a
            href={playground.promotedPrUrl}
            target="_blank"
            rel="noreferrer"
            style={viewPrButtonStyle}
          >
            PR ↗
          </a>
        ) : null}
        <button
          type="button"
          onClick={onPromote}
          disabled={promoteDisabled}
          title={
            promoteDisabled
              ? '시간 여행 중에는 Promote 할 수 없습니다 (최신으로 복귀 먼저)'
              : 'Playground 의 모든 변경을 msm-portal 에 PR로 올립니다'
          }
          style={{
            ...promoteButtonStyle,
            opacity: promoteDisabled ? 0.5 : 1,
            cursor: promoteDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          🚀 Promote
        </button>
      </div>
    </header>
  );
}

interface PromoteDialogProps {
  stage: PromoteStage;
  onCancel: () => void;
  onRun: (dryRun: boolean) => void;
}

function PromoteDialog({ stage, onCancel, onRun }: PromoteDialogProps) {
  return (
    <div style={dialogOverlayStyle} role="dialog" aria-modal>
      <div style={dialogPanelStyle}>
        {stage.kind === 'confirm' && (
          <PromoteConfirm stage={stage} onCancel={onCancel} onRun={onRun} />
        )}
        {stage.kind === 'running' && <PromoteRunning dryRun={stage.dryRun} />}
        {stage.kind === 'done' && (
          <PromoteDone result={stage.result} onClose={onCancel} />
        )}
        {stage.kind === 'error' && (
          <PromoteError
            message={stage.message}
            dryRun={stage.dryRun}
            onClose={onCancel}
          />
        )}
      </div>
    </div>
  );
}

function PromoteConfirm({
  stage,
  onCancel,
  onRun,
}: {
  stage: { kind: 'confirm'; dryRun: boolean };
  onCancel: () => void;
  onRun: (dryRun: boolean) => void;
}) {
  const [dryRun, setDryRun] = useState(stage.dryRun);
  return (
    <>
      <h2 style={dialogTitleStyle}>🚀 Promote to msm-portal</h2>
      <p style={dialogBodyStyle}>
        이 Playground 의 모든 변경(baseline → HEAD)을{' '}
        <code>moloco/msm-portal</code> 에{' '}
        {dryRun ? (
          <strong>로컬에서만 시뮬레이션</strong>
        ) : (
          <strong>실제로 push + PR 생성</strong>
        )}
        합니다.
      </p>
      <label style={dryRunLabelStyle}>
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
        />
        <span>
          <strong>Dry-run</strong> — 호스트 clone 에서 <code>git am</code> 까지만
          시도 (push 안 함)
        </span>
      </label>
      {!dryRun && (
        <div style={warningBoxStyle}>
          ⚠️ 이 옵션은 <code>origin</code> 에 새 브랜치를 push 하고 GitHub 에 PR을
          만듭니다. 되돌리려면 수동으로 브랜치를 지워야 합니다.
        </div>
      )}
      <div style={dialogActionsStyle}>
        <button type="button" onClick={onCancel} style={dialogCancelStyle}>
          취소
        </button>
        <button
          type="button"
          onClick={() => onRun(dryRun)}
          style={dialogPrimaryStyle}
        >
          {dryRun ? '시뮬레이션 실행' : '실제 Promote 실행'}
        </button>
      </div>
    </>
  );
}

function PromoteRunning({ dryRun }: { dryRun: boolean }) {
  return (
    <>
      <h2 style={dialogTitleStyle}>
        {dryRun ? '시뮬레이션 중…' : 'Promote 중…'}
      </h2>
      <p style={dialogBodyStyle}>
        샌드박스에서 patch 추출 → 호스트 clone 에서 <code>git am</code>
        {dryRun ? '' : ' → push → PR 생성'} 중입니다. 보통 10~60초 걸립니다.
      </p>
      <div style={spinnerStyle} aria-hidden />
    </>
  );
}

function PromoteDone({
  result,
  onClose,
}: {
  result: PromoteResult;
  onClose: () => void;
}) {
  return (
    <>
      <h2 style={dialogTitleStyle}>
        {result.dryRun ? '✅ 시뮬레이션 완료' : '✅ Promote 완료'}
      </h2>
      <div style={dialogBodyStyle}>
        <div>
          Patches: <strong>{result.patches.length}</strong>개 추출 ·{' '}
          <span style={{ color: 'var(--success)' }}>
            applied {result.applied.length}
          </span>{' '}
          ·{' '}
          <span
            style={{
              color: result.skipped.length
                ? 'var(--warning)'
                : 'var(--text-tertiary)',
            }}
          >
            skipped {result.skipped.length}
          </span>
        </div>
        <div style={{ marginTop: 8 }}>
          Branch:{' '}
          <code style={{ fontFamily: 'ui-monospace, monospace' }}>
            {result.branch}
          </code>
        </div>
        {result.prUrl && (
          <div style={{ marginTop: 8 }}>
            <a
              href={result.prUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)', fontWeight: 600 }}
            >
              PR 열기 ↗
            </a>
          </div>
        )}
        {result.dryRun && (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: 'var(--text-tertiary)',
            }}
          >
            dry-run 이었으므로 <code>origin</code> 에는 push 되지 않았습니다.
            로컬 브랜치만 남아있습니다.
          </div>
        )}
      </div>
      {result.applied.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={detailsSummaryStyle}>
            Applied ({result.applied.length})
          </summary>
          <ul style={patchListStyle}>
            {result.applied.map((a) => (
              <li key={a.file}>
                <code>{a.file}</code> →{' '}
                <code>{a.commit.slice(0, 8)}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
      {result.skipped.length > 0 && (
        <details open style={{ marginTop: 8 }}>
          <summary style={detailsSummaryStyle}>
            ⚠️ Skipped ({result.skipped.length})
          </summary>
          <ul style={patchListStyle}>
            {result.skipped.map((s) => (
              <li key={s.file}>
                <code>{s.file}</code>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                  {s.reason}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div style={dialogActionsStyle}>
        <button type="button" onClick={onClose} style={dialogPrimaryStyle}>
          닫기
        </button>
      </div>
    </>
  );
}

function PromoteError({
  message,
  dryRun,
  onClose,
}: {
  message: string;
  dryRun: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <h2 style={dialogTitleStyle}>
        ❌ {dryRun ? '시뮬레이션' : 'Promote'} 실패
      </h2>
      <div style={{ ...dialogBodyStyle, color: 'var(--error)' }}>
        {message}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          color: 'var(--text-tertiary)',
        }}
      >
        호스트 msm-portal 상태를 확인하세요. 로컬 브랜치가 남았을 수 있습니다 —
        <code>
          {' cd '}
          $SOURCE_WORKSPACE_ROOT/msm-portal && git branch
        </code>
      </div>
      <div style={dialogActionsStyle}>
        <button type="button" onClick={onClose} style={dialogPrimaryStyle}>
          닫기
        </button>
      </div>
    </>
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
  const commentActive = mode === 'comment';
  const toggleComment = () =>
    onChange(commentActive ? 'interactive' : 'comment');

  return (
    <div style={toolbarStyle}>
      <button
        type="button"
        onClick={toggleComment}
        title={
          commentActive
            ? '코멘트 모드 끄기 (앱 상호작용으로 복귀)'
            : '코멘트 모드 — 화면을 클릭해 핀 메모를 남깁니다'
        }
        style={{
          ...modeButtonStyle,
          background: commentActive
            ? 'var(--accent)'
            : 'var(--bg-elevated)',
          color: commentActive
            ? 'var(--text-inverse)'
            : 'var(--text-primary)',
          borderColor: commentActive
            ? 'var(--accent)'
            : 'var(--border-primary)',
        }}
      >
        <span aria-hidden style={{ marginRight: 4 }}>
          💬
        </span>
        Comment
      </button>
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
  flex: '0 0 auto',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: 'var(--bg-primary)',
};

const resizerStyle: React.CSSProperties = {
  flex: '0 0 auto',
  width: 6,
  cursor: 'col-resize',
  background: 'var(--border-primary)',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const resizerGripStyle: React.CSSProperties = {
  width: 2,
  height: 28,
  borderRadius: 1,
  background: 'var(--text-tertiary)',
  opacity: 0.4,
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

const promoteButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--accent)',
  color: 'var(--text-inverse)',
  fontFamily: 'inherit',
};

const viewPrButtonStyle: React.CSSProperties = {
  padding: '6px 10px',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  textDecoration: 'none',
  fontFamily: 'inherit',
};

const dialogOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};

const dialogPanelStyle: React.CSSProperties = {
  width: 520,
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(100vh - 64px)',
  overflow: 'auto',
  padding: 20,
  background: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-lg, 10px)',
  boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const dialogTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 12,
  fontSize: 16,
  fontWeight: 700,
};

const dialogBodyStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--text-secondary)',
};

const dryRunLabelStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  marginTop: 12,
  fontSize: 13,
  color: 'var(--text-primary)',
  cursor: 'pointer',
};

const warningBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: '8px 12px',
  fontSize: 12,
  lineHeight: 1.5,
  background: 'var(--warning-light, #fff7e6)',
  border: '1px solid var(--warning, #f5a623)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
};

const dialogActionsStyle: React.CSSProperties = {
  marginTop: 16,
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const dialogCancelStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const dialogPrimaryStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--accent)',
  color: 'var(--text-inverse)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const spinnerStyle: React.CSSProperties = {
  marginTop: 16,
  width: 20,
  height: 20,
  border: '2px solid var(--border-primary)',
  borderTopColor: 'var(--accent)',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

const detailsSummaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const patchListStyle: React.CSSProperties = {
  marginTop: 6,
  paddingLeft: 20,
  fontSize: 12,
  color: 'var(--text-secondary)',
};

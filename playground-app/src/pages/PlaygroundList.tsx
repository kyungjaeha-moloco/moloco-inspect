/**
 * Playground list — root page at `/`.
 *
 * Groups playgrounds by status so the user can find the right session
 * quickly. The real 2-pane editor lives at `/p/:id`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProjectStore } from '../store/project-store';
import type { Playground, PlaygroundStatus } from '../services/orchestrator-client';
import { listPlaygrounds } from '../services/orchestrator-client';

const CREATED_BY_STORAGE_KEY = 'playground-app.createdBy';
import {
  dismissLegacyComments,
  downloadLegacyComments,
  listLegacyProjects,
  readLegacyComments,
} from '../services/migrate-v2-to-v3';

const STATUS_LABEL: Record<PlaygroundStatus, string> = {
  active: '활성',
  hibernated: '대기',
  archived: '보관',
  crashed: '오류',
};

const STATUS_COLOR: Record<PlaygroundStatus, string> = {
  active: 'var(--success)',
  hibernated: 'var(--warning)',
  archived: 'var(--text-tertiary)',
  crashed: 'var(--error)',
};

export function PlaygroundList() {
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);
  const refreshProjects = useProjectStore((s) => s.refreshProjects);
  const createPlayground = useProjectStore((s) => s.createPlayground);

  const [playgrounds, setPlaygrounds] = useState<Playground[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [legacyProjects, setLegacyProjects] = useState<string[]>(() =>
    listLegacyProjects(),
  );
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    refreshProjects().catch((err) => {
      console.error('[PlaygroundList] refreshProjects failed', err);
    });
    listPlaygrounds()
      .then(setPlaygrounds)
      .catch((err) => {
        console.error('[PlaygroundList] listPlaygrounds failed', err);
        setError(err?.message ?? String(err));
      });
  }, [refreshProjects]);

  const handleDownloadLegacy = (projectId: string) => {
    const comments = readLegacyComments(projectId);
    if (!comments) return;
    downloadLegacyComments(projectId, comments);
  };

  const handleDismissLegacy = (projectId: string) => {
    dismissLegacyComments(projectId);
    setLegacyProjects((prev) => prev.filter((id) => id !== projectId));
  };

  const { active, hibernated, archived, crashed } = useMemo(() => {
    const grouped = groupByStatus(playgrounds);
    return {
      active: grouped.active ?? [],
      hibernated: grouped.hibernated ?? [],
      archived: grouped.archived ?? [],
      crashed: grouped.crashed ?? [],
    };
  }, [playgrounds]);

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <h1 style={titleStyle}>Playgrounds</h1>
            <p style={subtitleStyle}>
              {projects.length > 0 ? (
                <>
                  <code style={inlineCodeStyle}>
                    {projects.length === 1
                      ? projects[0].id
                      : `${projects.length}개 프로젝트`}
                  </code>
                  {' · '}
                </>
              ) : null}
              활성 {active.length} · 대기 {hibernated.length} · 보관 {archived.length}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a
              href="http://127.0.0.1:4174/"
              target="_blank"
              rel="noreferrer"
              title="Ops Dashboard 열기 (포트 4174)"
              style={ghostLinkStyle}
            >
              Dashboard ↗
            </a>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              style={primaryCtaStyle}
            >
              <span aria-hidden style={{ fontSize: 14, marginRight: 6 }}>
                +
              </span>
              새 Playground
            </button>
          </div>
        </header>

        {legacyProjects.length > 0 && (
          <LegacyMigrationBanner
            projectIds={legacyProjects}
            onDownload={handleDownloadLegacy}
            onDismiss={handleDismissLegacy}
          />
        )}

        {error && (
          <div style={errorBannerStyle}>
            오케스트레이터에서 플레이그라운드를 불러오지 못했습니다: {error}
          </div>
        )}

        {crashed.length > 0 && (
          <Section label="오류" count={crashed.length} tone="error">
            <CardGrid items={crashed} />
          </Section>
        )}

        {active.length > 0 ? (
          <Section label="활성" count={active.length} tone="accent">
            <CardGrid items={active} />
          </Section>
        ) : !error && playgrounds.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : null}

        {hibernated.length > 0 && (
          <Section label="대기" count={hibernated.length} tone="muted">
            <CardGrid items={hibernated} muted />
          </Section>
        )}

        {archived.length > 0 && (
          <CollapsibleSection label="보관" count={archived.length}>
            <ArchiveList items={archived} />
          </CollapsibleSection>
        )}
      </div>

      {createOpen && (
        <CreatePlaygroundDialog
          defaultProjectId={projects[0]?.id ?? 'visual-demo'}
          onCancel={() => setCreateOpen(false)}
          onCreate={async (input) => {
            const pg = await createPlayground(input);
            setPlaygrounds((prev) => {
              const exists = prev.some((p) => p.id === pg.id);
              return exists ? prev.map((p) => (p.id === pg.id ? pg : p)) : [pg, ...prev];
            });
            setCreateOpen(false);
            navigate(`/p/${pg.id}`);
          }}
        />
      )}
    </div>
  );
}

// ── Sections ─────────────────────────────────────────────────────────

function Section({
  label,
  count,
  tone,
  children,
}: {
  label: string;
  count: number;
  tone: 'accent' | 'muted' | 'error';
  children: React.ReactNode;
}) {
  const dotColor =
    tone === 'accent'
      ? 'var(--accent)'
      : tone === 'error'
        ? 'var(--error)'
        : 'var(--text-tertiary)';
  return (
    <section style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <span aria-hidden style={{ ...sectionDotStyle, background: dotColor }} />
        <span style={sectionLabelStyle}>{label}</span>
        <span style={sectionCountStyle}>{count}</span>
      </div>
      {children}
    </section>
  );
}

function CollapsibleSection({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <details style={sectionStyle}>
      <summary style={collapsibleSummaryStyle}>
        <span aria-hidden data-chevron style={chevronStyle}>
          ▸
        </span>
        <span style={sectionLabelStyle}>{label}</span>
        <span style={sectionCountStyle}>{count}</span>
      </summary>
      <div style={{ marginTop: 12 }}>{children}</div>
    </details>
  );
}

// ── Card Grid (active / hibernated / crashed) ────────────────────────

function CardGrid({
  items,
  muted = false,
}: {
  items: Playground[];
  muted?: boolean;
}) {
  return (
    <ul style={cardGridStyle}>
      {items.map((pg) => (
        <li key={pg.id} style={{ listStyle: 'none' }}>
          <PlaygroundCard pg={pg} muted={muted} />
        </li>
      ))}
    </ul>
  );
}

function PlaygroundCard({
  pg,
  muted = false,
}: {
  pg: Playground;
  muted?: boolean;
}) {
  return (
    <Link
      to={`/p/${pg.id}`}
      style={{ ...cardStyle, opacity: muted ? 0.75 : 1 }}
      className="playground-card"
    >
      <div style={cardHeaderStyle}>
        <span
          aria-hidden
          style={{
            ...statusDotStyle,
            background: STATUS_COLOR[pg.status],
          }}
          title={STATUS_LABEL[pg.status]}
        />
        <span style={cardTitleStyle}>{pg.title}</span>
        <span aria-hidden style={openIconStyle}>
          ↗
        </span>
      </div>

      <div style={cardMetaRowStyle}>
        <Pill>{pg.id}</Pill>
        <Pill tone="neutral">{pg.projectId}</Pill>
        {pg.headCommitSha && <Pill tone="mono">{pg.headCommitSha.slice(0, 7)}</Pill>}
      </div>

      <div style={cardFooterStyle}>
        {pg.createdBy ? (
          <span>
            <span style={{ color: 'var(--text-tertiary)' }}>by </span>
            <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
              {pg.createdBy}
            </span>
          </span>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>작성자 미기록</span>
        )}
        <span style={{ color: 'var(--text-tertiary)' }}>
          {formatRelativeTime(pg.lastActivityAt ?? pg.createdAt)}
        </span>
      </div>
    </Link>
  );
}

function Pill({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'neutral' | 'mono';
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 'var(--radius-sm)',
    fontFamily: tone === 'mono' ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit',
    letterSpacing: tone === 'mono' ? '-0.01em' : 0,
    lineHeight: 1.6,
  };
  if (tone === 'neutral') {
    return (
      <span
        style={{
          ...base,
          background: 'var(--badge-bg)',
          color: 'var(--badge-text)',
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      style={{
        ...base,
        background: 'var(--chip-bg)',
        color: 'var(--chip-text)',
        border: '1px solid var(--chip-border)',
      }}
    >
      {children}
    </span>
  );
}

// ── Archive List (compact rows) ──────────────────────────────────────

function ArchiveList({ items }: { items: Playground[] }) {
  return (
    <ul style={archiveListStyle}>
      {items.map((pg) => (
        <li key={pg.id} style={archiveRowStyle}>
          <Link to={`/p/${pg.id}`} style={archiveLinkStyle}>
            <span style={archiveTitleStyle}>{pg.title}</span>
            <span style={archiveMetaStyle}>
              <code style={inlineCodeStyle}>{pg.id}</code>
              <span>·</span>
              {pg.createdBy ? <span>{pg.createdBy}</span> : null}
              {pg.createdBy ? <span>·</span> : null}
              <span>{formatRelativeTime(pg.updatedAt ?? pg.createdAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Empty State ──────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={emptyStateStyle}>
      <div style={emptyIconStyle} aria-hidden>
        🧪
      </div>
      <div style={emptyTitleStyle}>아직 Playground가 없습니다</div>
      <p style={emptyBodyStyle}>
        UI 변경을 실험하고 PR까지 보내는 격리된 샌드박스를 만들 수 있습니다.
        아래 버튼은 준비 중 — 당장은 Chrome 확장의 <strong>+ New</strong> 또는
        API로 생성하세요.
      </p>
      <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button type="button" onClick={onCreate} style={primaryCtaStyle}>
          + 새 Playground
        </button>
        <a
          href="http://localhost:3847/api/playground"
          target="_blank"
          rel="noreferrer"
          style={ghostLinkStyle}
        >
          API 열기 ↗
        </a>
      </div>
    </div>
  );
}

// ── Legacy v2 banner (preserved from original) ───────────────────────

function LegacyMigrationBanner({
  projectIds,
  onDownload,
  onDismiss,
}: {
  projectIds: string[];
  onDownload: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div style={legacyBannerStyle}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>
        이전 Canvas 버전의 댓글 {projectIds.length}건 발견
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
        v3 Playground는 캔버스 개념이 없어 자동 이관이 불가능합니다. 필요하면 아래에서
        JSON으로 내려받으세요.
      </p>
      <ul style={legacyListStyle}>
        {projectIds.map((pid) => {
          const count = readLegacyComments(pid)?.length ?? 0;
          return (
            <li key={pid} style={legacyRowStyle}>
              <code style={{ ...inlineCodeStyle, flex: 1 }}>
                {pid} · {count}건
              </code>
              <button
                type="button"
                onClick={() => onDownload(pid)}
                style={legacySecondaryStyle}
              >
                ⬇ 다운로드
              </button>
              <button
                type="button"
                onClick={() => onDismiss(pid)}
                style={legacyGhostStyle}
                title="저장소에서 제거 (되돌릴 수 없음)"
              >
                제거
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Create Dialog ────────────────────────────────────────────────────

interface CreatePlaygroundDialogProps {
  defaultProjectId: string;
  onCancel: () => void;
  onCreate: (input: {
    projectId: string;
    title: string;
    createdBy?: string;
    prdUrl?: string;
    jiraUrl?: string;
  }) => Promise<void>;
}

function CreatePlaygroundDialog({
  defaultProjectId,
  onCancel,
  onCreate,
}: CreatePlaygroundDialogProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [createdBy, setCreatedBy] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(CREATED_BY_STORAGE_KEY) ?? '';
  });
  const [advanced, setAdvanced] = useState(false);
  const [prdUrl, setPrdUrl] = useState('');
  const [jiraUrl, setJiraUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel, submitting]);

  const canSubmit = title.trim().length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      const trimmedName = createdBy.trim();
      if (trimmedName) {
        window.localStorage.setItem(CREATED_BY_STORAGE_KEY, trimmedName);
      }
      await onCreate({
        projectId: defaultProjectId,
        title: title.trim(),
        createdBy: trimmedName || undefined,
        prdUrl: prdUrl.trim() || undefined,
        jiraUrl: jiraUrl.trim() || undefined,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : '생성에 실패했습니다';
      setErr(message);
      setSubmitting(false);
    }
  };

  return (
    <div
      style={createOverlayStyle}
      role="dialog"
      aria-modal
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onCancel();
      }}
    >
      <form onSubmit={handleSubmit} style={createPanelStyle}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            새 Playground
          </h2>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 12,
              color: 'var(--text-tertiary)',
            }}
          >
            <code style={{ ...inlineCodeStyle, padding: '0 4px' }}>
              {defaultProjectId}
            </code>{' '}
            프로젝트에 샌드박스를 띄웁니다. 부팅에 10~60초 걸릴 수 있습니다.
          </p>
        </div>

        <Field label="제목" required>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: TVING 홈 개편 draft"
            disabled={submitting}
            style={inputStyle}
          />
        </Field>

        <Field label="내 이름 (기록용)">
          <input
            type="text"
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            placeholder="예: kyungjae"
            disabled={submitting}
            style={inputStyle}
          />
        </Field>

        {!advanced ? (
          <button
            type="button"
            onClick={() => setAdvanced(true)}
            style={linkButtonStyle}
          >
            고급 설정 (PRD / Jira 링크) ▸
          </button>
        ) : (
          <>
            <Field label="PRD URL">
              <input
                type="url"
                value={prdUrl}
                onChange={(e) => setPrdUrl(e.target.value)}
                placeholder="https://…"
                disabled={submitting}
                style={inputStyle}
              />
            </Field>
            <Field label="Jira URL">
              <input
                type="url"
                value={jiraUrl}
                onChange={(e) => setJiraUrl(e.target.value)}
                placeholder="https://moloco.atlassian.net/browse/…"
                disabled={submitting}
                style={inputStyle}
              />
            </Field>
          </>
        )}

        {err && <div style={createErrorStyle}>{err}</div>}

        <div
          style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={dialogCancelStyle}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              ...primaryCtaStyle,
              opacity: canSubmit ? 1 : 0.55,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? '생성 중…' : 'Playground 만들기'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={fieldStyle}>
      <span style={fieldLabelStyle}>
        {label}
        {required && (
          <span aria-hidden style={{ color: 'var(--accent)', marginLeft: 4 }}>
            *
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function groupByStatus(items: Playground[]): Partial<Record<PlaygroundStatus, Playground[]>> {
  const out: Partial<Record<PlaygroundStatus, Playground[]>> = {};
  for (const pg of items) {
    const bucket = (out[pg.status] ??= []);
    bucket.push(pg);
  }
  return out;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 45_000) return '방금 전';
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(diff / 3_600_000);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(diff / 86_400_000);
  if (day < 30) return `${day}일 전`;
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// ── Styles ───────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  width: '100%',
  background: 'var(--bg-primary)',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans KR", sans-serif',
};

const containerStyle: React.CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  padding: '48px 32px 96px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 24,
  marginBottom: 40,
  flexWrap: 'wrap',
};

const titleStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: 'var(--text-primary)',
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 13,
  color: 'var(--text-secondary)',
};

const inlineCodeStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: '0.92em',
  color: 'var(--text-secondary)',
  background: 'var(--bg-elevated)',
  padding: '1px 6px',
  borderRadius: 4,
  border: '1px solid var(--border-secondary)',
};

const primaryCtaStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-inverse)',
  background: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  boxShadow: 'var(--shadow-sm)',
  transition: 'all 120ms ease',
};

const ghostLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  background: 'transparent',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  textDecoration: 'none',
  fontFamily: 'inherit',
};

const errorBannerStyle: React.CSSProperties = {
  padding: '12px 16px',
  background: 'var(--error-light)',
  color: 'var(--error)',
  border: '1px solid var(--error)',
  borderRadius: 'var(--radius-md)',
  marginBottom: 24,
  fontSize: 13,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 32,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 14,
};

const sectionDotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
};

const sectionCountStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-tertiary)',
  padding: '1px 7px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-secondary)',
  borderRadius: 999,
  letterSpacing: 0,
};

const collapsibleSummaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  listStyle: 'none',
  userSelect: 'none',
};

const chevronStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-tertiary)',
  transition: 'transform 120ms ease',
};

const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: 16,
  padding: 0,
  margin: 0,
  listStyle: 'none',
};

const cardStyle: React.CSSProperties = {
  display: 'block',
  padding: 20,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-lg)',
  color: 'var(--text-primary)',
  textDecoration: 'none',
  boxShadow: 'var(--shadow-sm)',
  transition: 'border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 14,
};

const statusDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
  boxShadow: '0 0 0 3px var(--bg-elevated), 0 0 0 4px rgba(15,29,51,0.06)',
};

const cardTitleStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--text-primary)',
  letterSpacing: '-0.01em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const openIconStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-tertiary)',
  marginLeft: 'auto',
};

const cardMetaRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
  marginBottom: 14,
};

const cardFooterStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  paddingTop: 12,
  borderTop: '1px solid var(--border-secondary)',
  fontSize: 12,
  color: 'var(--text-secondary)',
};

const archiveListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  background: 'var(--bg-elevated)',
};

const archiveRowStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--border-secondary)',
};

const archiveLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 16px',
  color: 'var(--text-secondary)',
  textDecoration: 'none',
  fontSize: 13,
};

const archiveTitleStyle: React.CSSProperties = {
  flex: 1,
  fontWeight: 500,
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const archiveMetaStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: 'var(--text-tertiary)',
  flexShrink: 0,
};

const emptyStateStyle: React.CSSProperties = {
  padding: '56px 24px',
  textAlign: 'center',
  border: '1px dashed var(--border-primary)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--bg-elevated)',
};

const emptyIconStyle: React.CSSProperties = {
  fontSize: 40,
  marginBottom: 12,
};

const emptyTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--text-primary)',
  marginBottom: 6,
};

const emptyBodyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
  maxWidth: 440,
  marginLeft: 'auto',
  marginRight: 'auto',
};

const legacyBannerStyle: React.CSSProperties = {
  padding: '14px 16px',
  background: 'var(--warning-light)',
  border: '1px solid var(--warning)',
  borderRadius: 'var(--radius-md)',
  marginBottom: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  color: 'var(--text-primary)',
};

const legacyListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const legacyRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
};

const legacySecondaryStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const legacyGhostStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const createOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 29, 51, 0.42)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 'min(15vh, 120px)',
  zIndex: 300,
};

const createPanelStyle: React.CSSProperties = {
  width: 440,
  maxWidth: 'calc(100vw - 32px)',
  padding: 24,
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-lg)',
  fontFamily: 'inherit',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 14,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary)',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--text-primary)',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  fontFamily: 'inherit',
};

const linkButtonStyle: React.CSSProperties = {
  padding: '2px 0',
  fontSize: 12,
  fontWeight: 500,
  background: 'transparent',
  border: 'none',
  color: 'var(--accent-text)',
  cursor: 'pointer',
  alignSelf: 'flex-start',
  fontFamily: 'inherit',
  marginBottom: 6,
};

const createErrorStyle: React.CSSProperties = {
  marginTop: 4,
  padding: '8px 12px',
  fontSize: 12,
  color: 'var(--error)',
  background: 'var(--error-light)',
  border: '1px solid var(--error)',
  borderRadius: 'var(--radius-md)',
};

const dialogCancelStyle: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

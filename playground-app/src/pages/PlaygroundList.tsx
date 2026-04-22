/**
 * Playground list — root page at `/`.
 *
 * Groups playgrounds by status so the user can find the right session
 * quickly. The real 2-pane editor lives at `/p/:id`.
 *
 * M2 minimum: render and navigate. Creation flow, archive/hibernate
 * controls, and project grouping polish happen in follow-up tasks.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjectStore } from '../store/project-store';
import type { Playground, PlaygroundStatus } from '../services/orchestrator-client';
import { listPlaygrounds } from '../services/orchestrator-client';
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

const STATUS_ORDER: PlaygroundStatus[] = ['active', 'hibernated', 'archived', 'crashed'];

export function PlaygroundList() {
  const projects = useProjectStore((s) => s.projects);
  const refreshProjects = useProjectStore((s) => s.refreshProjects);

  const [playgrounds, setPlaygrounds] = useState<Playground[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [legacyProjects, setLegacyProjects] = useState<string[]>(() =>
    listLegacyProjects(),
  );

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

  const grouped = useMemo(() => groupByStatus(playgrounds), [playgrounds]);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Playgrounds</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
          프로젝트 {projects.length}개 · 플레이그라운드 {playgrounds.length}개
        </p>
      </header>

      {legacyProjects.length > 0 && (
        <div
          style={{
            padding: 12,
            background: 'var(--warning-light)',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 13,
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ fontWeight: 600 }}>
            이전 Canvas 버전의 댓글 {legacyProjects.length}건 발견
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
            v3 Playground는 캔버스 개념이 없어 자동 이관이 불가능합니다. 필요하면 아래에서
            JSON으로 내려받으세요.
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {legacyProjects.map((pid) => {
              const count = readLegacyComments(pid)?.length ?? 0;
              return (
                <li
                  key={pid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <code
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                      color: 'var(--text-secondary)',
                      flex: 1,
                    }}
                  >
                    {pid} · {count}건
                  </code>
                  <button
                    type="button"
                    onClick={() => handleDownloadLegacy(pid)}
                    style={{
                      padding: '3px 8px',
                      fontSize: 11,
                      border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    ⬇ 다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismissLegacy(pid)}
                    style={{
                      padding: '3px 8px',
                      fontSize: 11,
                      border: '1px solid transparent',
                      background: 'transparent',
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    title="저장소에서 제거 (되돌릴 수 없음)"
                  >
                    제거
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            background: 'var(--error-light)',
            color: 'var(--error)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 16,
          }}
        >
          오케스트레이터에서 플레이그라운드를 불러오지 못했습니다: {error}
        </div>
      )}

      {STATUS_ORDER.map((status) => {
        const items = grouped[status];
        if (!items || items.length === 0) return null;
        return (
          <section key={status} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
              {STATUS_LABEL[status]} · {items.length}
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {items.map((pg) => (
                <li
                  key={pg.id}
                  style={{
                    padding: 12,
                    borderBottom: '1px solid var(--border-primary)',
                  }}
                >
                  <Link
                    to={`/p/${pg.id}`}
                    style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                  >
                    <div style={{ fontWeight: 600 }}>{pg.title}</div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                      {pg.id} · {pg.projectId}
                      {pg.headCommitSha
                        ? ` · ${pg.headCommitSha.slice(0, 7)}`
                        : ''}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {!error && playgrounds.length === 0 && (
        <p style={{ color: 'var(--text-tertiary)' }}>
          플레이그라운드가 없습니다. 새 플레이그라운드 생성 UI는 준비 중입니다.
        </p>
      )}
    </div>
  );
}

function groupByStatus(items: Playground[]): Partial<Record<PlaygroundStatus, Playground[]>> {
  const out: Partial<Record<PlaygroundStatus, Playground[]>> = {};
  for (const pg of items) {
    const bucket = (out[pg.status] ??= []);
    bucket.push(pg);
  }
  return out;
}

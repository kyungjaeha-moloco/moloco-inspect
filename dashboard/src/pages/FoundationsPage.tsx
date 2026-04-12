import React, { useState } from 'react';
import { DocsLayout, Breadcrumbs } from '../components/DocsLayout';
import type { FoundationsData, TokenValue } from '../types';
import { sectionMeta, formatSemantic, getContrastText } from '../utils';

export function FoundationsColorsPage({
  foundationsData,
}: {
  foundationsData: FoundationsData;
}) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const palette = foundationsData[mode];
  const sections = foundationsData.sections.filter((section) => palette[section]);
  const tokenCount = sections.reduce((sum, section) => sum + Object.keys(palette[section] ?? {}).length, 0);

  return (
    <DocsLayout
      title="Foundations"
      description="Human-readable design documentation built from the live JSON design-system source of truth."
      sidebarGroups={[
        {
          title: 'Overview',
          items: [
            { label: 'Design System Home', to: '/design-system' },
            { label: 'Colors', to: '/foundations/colors' },
            { label: 'Components', to: '/components' },
            { label: 'UX Writing', to: '/ux-writing' },
          ],
        },
        {
          title: 'Base Material',
          items: sections.map((section, index) => ({
            label: sectionMeta[section]?.title ?? section,
            href: `#section-${section}`,
            active: index === 0,
            tone: 'sub' as const,
          })),
        },
        {
          title: 'Theme',
          chips: ['Semantic', 'Light / Dark', 'Visual'],
        },
      ]}
    >
      <div className="docs-topbar">
        <Breadcrumbs items={['Foundations', 'Base material', 'Colors']} />
        <div className="segmented">
          {foundationsData.modes.map((item) => (
            <button
              className={item === mode ? 'active' : ''}
              key={item}
              onClick={() => setMode(item)}
              type="button"
            >
              {item === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </div>

      <section className="docs-hero">
        <div className="eyebrow">Colors</div>
        <h1>Semantic colors</h1>
        <p>
          MSM Portal의 컬러 시스템은 의미 기반으로 정리되어 있습니다. 이 페이지는 실제
          <code>semantic-palette.json</code>에서 값을 읽어와서 사람이 스와치와 용도를 함께 보며 판단할 수
          있도록 만든 문서형 브라우저입니다.
        </p>
        <div className="docs-tabs">
          <div className="docs-tab active">Semantic</div>
          <div className="docs-tab inactive">Atomic</div>
        </div>
      </section>

      <section className="docs-grid">
        <article className="docs-card span-3 stat">
          <div className="label">Mode</div>
          <div className="value">{mode === 'light' ? 'Light' : 'Dark'}</div>
          <div className="note">라이트/다크 테마 값을 바로 비교할 수 있습니다.</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Sections</div>
          <div className="value">{sections.length}</div>
          <div className="note">텍스트, 배경, 라인, 아이콘 등 색상 그룹 수</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Visible Tokens</div>
          <div className="value">{tokenCount}</div>
          <div className="note">현재 모드에서 렌더링된 토큰 개수</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Source</div>
          <div className="value">Live JSON</div>
          <div className="note">디자인 시스템 소스와 문서가 같은 값을 보게 맞춰졌습니다.</div>
        </article>

        <article className="docs-card span-12">
          <div className="docs-section-head">
            <div>
              <h2>On this page</h2>
              <p className="docs-section-copy">참고 사이트처럼 섹션 단위로 빠르게 이동할 수 있게 구성했습니다.</p>
            </div>
          </div>
          <div className="toc-pills">
            {sections.map((section) => (
              <a className="toc-pill" href={`#section-${section}`} key={section}>
                {sectionMeta[section]?.title ?? section}
              </a>
            ))}
          </div>
        </article>

        {sections.map((section) => {
          const entries = Object.entries(palette[section] ?? {}).filter(
            (entry): entry is [string, TokenValue] =>
              typeof entry[1] === 'object' && entry[1] !== null && 'hex' in entry[1],
          );
          const meta = sectionMeta[section] ?? {
            title: section.replaceAll('_', ' '),
            badge: 'Section',
            description: 'Semantic color group',
          };

          return (
            <article className="docs-section-card span-12" id={`section-${section}`} key={section}>
              <div className="docs-section-head">
                <div>
                  <div className="docs-badge">{meta.badge}</div>
                  <h2 className="docs-inline-title">{meta.title}</h2>
                  <p className="docs-section-copy">{meta.description}</p>
                </div>
                <div className="chip">{entries.length} tokens</div>
              </div>
              <div className="token-grid">
                {entries.map(([tokenName, tokenValue]) => (
                  <article className="token-card" key={tokenName}>
                    <div
                      className="token-swatch token-swatch-rich"
                      style={{
                        background: tokenValue.hex,
                        color: getContrastText(tokenValue.hex),
                      }}
                    >
                      <strong>{tokenValue.hex}</strong>
                      <span className="token-mode-tag">{mode.toUpperCase()}</span>
                    </div>
                    <div className="token-body">
                      <h3>{tokenName}</h3>
                      <div className="chip-row">
                        <span className="chip stable">{meta.badge}</span>
                      </div>
                      <div className="token-meta token-meta-top">
                        <div className="meta-row">
                          <div className="meta-label">Semantic</div>
                          <div className="meta-value">{formatSemantic(tokenValue.semantic)}</div>
                        </div>
                        <div className="meta-row">
                          <div className="meta-label">Theme Path</div>
                          <div className="meta-value">
                            <code>{tokenName}</code>
                          </div>
                        </div>
                        <div className="meta-row">
                          <div className="meta-label">Usage</div>
                          <div className="meta-value">{tokenValue.usage ?? 'No usage description'}</div>
                        </div>
                        <div className="meta-row">
                          <div className="meta-label">Source</div>
                          <div className="meta-value">
                            {tokenValue.source ?? tokenValue.lightEquivalent ?? 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </DocsLayout>
  );
}

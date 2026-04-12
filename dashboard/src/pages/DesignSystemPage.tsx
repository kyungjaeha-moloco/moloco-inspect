import React from 'react';
import { NavLink } from 'react-router-dom';
import { DocsLayout, Breadcrumbs } from '../components/DocsLayout';
import type { ComponentsCatalog, FoundationsData, UxWritingJson } from '../types';
import { contractRuleCount } from '../utils';

export function DesignSystemHomePage({
  foundationsData,
  componentsCatalog,
  dependencyCoverageCount,
  uxWritingData,
}: {
  foundationsData: FoundationsData;
  componentsCatalog: ComponentsCatalog;
  dependencyCoverageCount: number;
  uxWritingData: UxWritingJson;
}) {
  return (
    <DocsLayout
      title="Documentation"
      description="Contract-first 디자인 시스템을 사람도 이해할 수 있게 보여주는 React 기반 문서 브라우저입니다."
      sidebarGroups={[
        {
          title: 'Overview',
          items: [
            { label: 'Design System Home', to: '/design-system' },
            { label: 'Foundations / Colors', to: '/foundations/colors' },
            { label: 'Components', to: '/components' },
            { label: 'UX Writing', to: '/ux-writing' },
            { label: 'Progress Dashboard', to: '/' },
          ],
        },
      ]}
    >
      <div className="docs-topbar">
        <Breadcrumbs items={['Documentation', 'Home']} />
      </div>

      <section className="docs-hero">
        <div className="eyebrow">MSM Portal Design System</div>
        <h1>Browse foundations and components like a real docs site</h1>
        <p>
          이 페이지는 contract-first 프로그램의 첫 React 기반 디자인 시스템 홈입니다. 토큰과 컴포넌트를
          JSON 파일이 아니라 실제 문서 사이트처럼 보고, 비교하고, 팀과 함께 판단할 수 있게 만드는 출발점입니다.
        </p>
        <div className="hero-actions">
          <NavLink className="button-link primary" to="/foundations/colors">
            Open Foundations
          </NavLink>
          <NavLink className="button-link secondary" to="/components">
            Open Components
          </NavLink>
          <NavLink className="button-link secondary" to="/ux-writing">
            Open UX Writing
          </NavLink>
        </div>
      </section>

      <section className="docs-grid">
        <article className="docs-card span-3 stat">
          <div className="label">Foundations</div>
          <div className="value">{foundationsData.sections.length}</div>
          <div className="note">Text, background, border, semantic border, and icon groups</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Modes</div>
          <div className="value">{foundationsData.modes.length}</div>
          <div className="note">Light and dark semantic values can be compared</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Categories</div>
          <div className="value">{componentsCatalog.meta.totalCategories}</div>
          <div className="note">Live groupings from the current component source of truth</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Components</div>
          <div className="value">{componentsCatalog.meta.totalComponents}</div>
          <div className="note">Public catalog coverage is now complete in the design-system inventory</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Dependencies</div>
          <div className="value">{dependencyCoverageCount}</div>
          <div className="note">Components with explicit provider setup and usage notes</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Contract Rules</div>
          <div className="value">{contractRuleCount}</div>
          <div className="note">Validator rules already enforcing contract-first boundaries</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">UX Writing</div>
          <div className="value">{uxWritingData.service_voice.principles.length}</div>
          <div className="note">Voice principles and writing rules for labels, errors, and empty states</div>
        </article>

        <article className="docs-section-card span-6">
          <div className="docs-section-head">
            <div>
              <div className="docs-badge">Foundations</div>
              <h2 className="docs-inline-title">Color system</h2>
              <p className="docs-section-copy">
                Montage 스타일 문서 사이트처럼 semantic color를 그룹별로 스와치와 설명으로 볼 수 있게 만들었습니다.
              </p>
            </div>
          </div>
          <div className="preview-surface">
            <div className="preview-stage">
              <div className="token-grid preview-grid-fixed">
                {['#346bea', '#212121', '#f8f8f8'].map((hex) => (
                  <div className="token-card" key={hex}>
                    <div className="token-swatch" style={{ background: hex }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="hero-actions">
            <NavLink className="button-link primary" to="/foundations/colors">
              Browse Colors
            </NavLink>
          </div>
        </article>

        <article className="docs-section-card span-6">
          <div className="docs-section-head">
            <div>
              <div className="docs-badge">Components</div>
              <h2 className="docs-inline-title">Preview-friendly catalog</h2>
              <p className="docs-section-copy">
                메타데이터만 나열하는 대신 대표 컴포넌트는 바로 보이는 프리뷰와 함께 검색하고 훑어볼 수 있습니다.
              </p>
            </div>
          </div>
          <div className="preview-surface">
            <div className="preview-stage">
              <div className="preview-layout-shell preview-full-width">
                <div className="preview-tabs">
                  <div className="preview-tab active">Overview</div>
                  <div className="preview-tab">Creative</div>
                  <div className="preview-tab">History</div>
                </div>
                <div className="preview-actionbar">
                  <div className="preview-counter">132 campaigns</div>
                  <div className="preview-button primary">Create</div>
                </div>
              </div>
            </div>
          </div>
          <div className="hero-actions">
            <NavLink className="button-link primary" to="/components">
              Browse Components
            </NavLink>
          </div>
        </article>

        <article className="docs-section-card span-6">
          <div className="docs-section-head">
            <div>
              <div className="docs-badge">UX Writing</div>
              <h2 className="docs-inline-title">Writing standards</h2>
              <p className="docs-section-copy">
                PM과 SA가 버튼, 오류, 빈 상태 문구를 같은 기준으로 볼 수 있도록 voice principle, do / don&apos;t,
                before / after 예제를 정리했습니다.
              </p>
            </div>
          </div>
          <div className="preview-surface">
            <div className="preview-stage preview-copy-stage">
              <div className="writing-preview-card">
                <div className="preview-mini-note">Button copy</div>
                <strong>변경 사항 저장</strong>
                <span className="preview-mini-note">Avoid: 저장</span>
              </div>
              <div className="writing-preview-card">
                <div className="preview-mini-note">Error recovery</div>
                <strong>타이틀을 입력하면 초안으로 저장할 수 있습니다.</strong>
              </div>
            </div>
          </div>
          <div className="hero-actions">
            <NavLink className="button-link primary" to="/ux-writing">
              Browse UX Writing
            </NavLink>
          </div>
        </article>
      </section>
    </DocsLayout>
  );
}

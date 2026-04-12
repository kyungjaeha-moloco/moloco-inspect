import React, { Suspense, lazy } from 'react';
import { NavLink } from 'react-router-dom';
import { DocsLayout, Breadcrumbs } from '../components/DocsLayout';
import type { ComponentsCatalog } from '../types';
import { contractRuleCount, draftedContractCount } from '../utils';

const LazyAnalyticsOverviewSection = lazy(() =>
  import('../analytics/AnalyticsPanels').then((module) => ({ default: module.AnalyticsOverviewSection })),
);

function KanbanColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'default' | 'brand' | 'success' | 'danger';
}) {
  return (
    <div className={`kanban-column kanban-${tone}`}>
      <div className="kanban-column-head">
        <div className="kanban-column-title">{title}</div>
        <div className="docs-badge">{items.length}</div>
      </div>
      <div className="kanban-stack">
        {items.map((item) => (
          <div className="kanban-card" key={item}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProgressPage({
  componentsCatalog,
  dependencyCoverageCount,
}: {
  componentsCatalog: ComponentsCatalog;
  dependencyCoverageCount: number;
}) {
  const backlog = [
    'Expand runtime previews beyond the current core components',
    'Add foundations pages for typography, spacing, radius, and motion',
    'Turn recipe and dependency data into richer usage guides',
  ];
  const inProgress = [
    'Connecting the React docs app directly to live catalog and dependency JSON',
    'Improving component cards so provider requirements are visible at a glance',
  ];
  const done = [
    'Contract-first documentation workspace and tracker',
    'Core contracts for MCButton2, MCContentLayout, MCBarTabs, MCFormTextInput, MCStatus',
    'Semantic token mapping and validation draft specs',
    'First contract-first validation rules in design-system',
    'All public shared components are now cataloged in design-system',
    'Human-readable docs browser for colors and components',
    'Dependency map expanded for form, auth, workplace, and ad-pacing components',
  ];
  const blocked = [
    'Some domain components still need safer sample data before true runtime previews',
    'Preview coverage is still partial for heavy table and overlay compositions',
  ];

  return (
    <DocsLayout
      title="Program Dashboard"
      description="Contract-first 전환 프로젝트의 진행 상황과 다음 액션을 한 화면에서 볼 수 있는 운영용 대시보드입니다."
      sidebarGroups={[
        {
          title: 'Overview',
          items: [
            { label: 'Progress Dashboard', to: '/' },
            { label: 'Design System Home', to: '/design-system' },
            { label: 'Foundations / Colors', to: '/foundations/colors' },
            { label: 'Components', to: '/components' },
            { label: 'UX Writing', to: '/ux-writing' },
          ],
        },
        {
          title: 'Current Focus',
          chips: ['React docs app', 'Component previews', 'DS catalog'],
        },
      ]}
    >
      <div className="docs-topbar">
        <Breadcrumbs items={['Program', 'Dashboard']} />
      </div>

      <section className="docs-hero">
        <div className="eyebrow">Contract-First Program</div>
        <h1>Turn the MSM Portal UI into a design system that both humans and AI can trust</h1>
        <p>
          이 대시보드는 서비스 코드 정리, contract 문서화, validation rule 구현, 사람용 문서 사이트 구축이
          어디까지 왔는지를 함께 보여줍니다.
        </p>
        <div className="hero-actions">
          <NavLink className="button-link primary" to="/design-system">
            Open docs site
          </NavLink>
          <NavLink className="button-link secondary" to="/components">
            Open components
          </NavLink>
        </div>
      </section>

      <section className="docs-grid">
        <article className="docs-card span-3 stat">
          <div className="label">Contracts</div>
          <div className="value">{draftedContractCount}</div>
          <div className="note">Core component contracts drafted and reviewed</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Contract Rules</div>
          <div className="value">{contractRuleCount}</div>
          <div className="note">Live contract-first rules currently wired into the validator</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Cataloged Components</div>
          <div className="value">{componentsCatalog.meta.totalComponents}</div>
          <div className="note">Live component inventory loaded from the latest design-system source</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Dependency Entries</div>
          <div className="value">{dependencyCoverageCount}</div>
          <div className="note">Components with explicit provider and rendering guidance</div>
        </article>
        <Suspense fallback={<article className="docs-section-card span-12"><div className="analytics-loading">운영 지표를 불러오는 중…</div></article>}>
          <LazyAnalyticsOverviewSection />
        </Suspense>

        <article className="docs-section-card span-12">
          <div className="docs-section-head">
            <div>
              <h2>Kanban view</h2>
              <p className="docs-section-copy">
                작업이 문서인지, 실제 코드인지, 다음 단계가 무엇인지 바로 이해할 수 있게 현재 흐름을 보드로 보여줍니다.
              </p>
            </div>
          </div>
          <div className="kanban-board">
            <KanbanColumn title="Backlog" items={backlog} tone="default" />
            <KanbanColumn title="In Progress" items={inProgress} tone="brand" />
            <KanbanColumn title="Done" items={done} tone="success" />
            <KanbanColumn title="Blocked" items={blocked} tone="danger" />
          </div>
        </article>
      </section>
    </DocsLayout>
  );
}

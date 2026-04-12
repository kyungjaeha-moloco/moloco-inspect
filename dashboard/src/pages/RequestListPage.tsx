import React, { Suspense, lazy } from 'react';
import { DocsLayout, Breadcrumbs } from '../components/DocsLayout';

const LazyAnalyticsOverviewSection = lazy(() =>
  import('../analytics/AnalyticsPanels').then((m) => ({ default: m.AnalyticsOverviewSection })),
);

export function RequestListPage() {
  return (
    <DocsLayout title="요청 목록" description="Agent 요청 이력과 운영 지표">
      <div className="docs-topbar">
        <Breadcrumbs items={['Ops Hub', '요청 목록']} />
      </div>
      <section className="docs-hero">
        <div className="eyebrow">Operations</div>
        <h1>요청 목록</h1>
        <p>Chrome Extension에서 보낸 모든 요청의 상태, 처리 시간, 승인률을 확인할 수 있습니다.</p>
      </section>
      <section className="docs-grid">
        <Suspense fallback={<div className="analytics-loading span-12">불러오는 중…</div>}>
          <LazyAnalyticsOverviewSection />
        </Suspense>
      </section>
    </DocsLayout>
  );
}

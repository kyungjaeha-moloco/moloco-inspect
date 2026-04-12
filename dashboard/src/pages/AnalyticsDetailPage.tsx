import React, { Suspense, lazy } from 'react';
import { useParams } from 'react-router-dom';
import { DocsLayout, Breadcrumbs } from '../components/DocsLayout';

const LazyAnalyticsDetailSection = lazy(() =>
  import('../analytics/AnalyticsPanels').then((module) => ({ default: module.AnalyticsDetailSection })),
);

export function AnalyticsDetailPage() {
  const { requestId } = useParams();

  return (
    <DocsLayout
      title="Request Detail"
      description="개별 요청이 어떤 계획과 lifecycle을 거쳐 preview와 apply까지 갔는지 확인하는 drill-down 화면입니다."
      sidebarGroups={[
        {
          title: 'Overview',
          items: [
            { label: 'Progress Dashboard', to: '/' },
            { label: 'Design System Home', to: '/design-system' },
            { label: 'Components', to: '/components' },
            { label: 'UX Writing', to: '/ux-writing' },
          ],
        },
      ]}
    >
      <div className="docs-topbar">
        <Breadcrumbs items={['Program', 'Analytics', requestId || 'Request']} />
      </div>

      <section className="docs-hero">
        <div className="eyebrow">Request Drill-down</div>
        <h1>{requestId || 'Unknown request'}</h1>
        <p>요청 원문, 처리 시간, lifecycle 이벤트, preview 결과를 한 화면에서 확인할 수 있습니다.</p>
      </section>

      <Suspense fallback={<section className="docs-grid"><div className="analytics-loading span-12">요청 상세를 불러오는 중…</div></section>}>
        <LazyAnalyticsDetailSection requestId={requestId} />
      </Suspense>
    </DocsLayout>
  );
}

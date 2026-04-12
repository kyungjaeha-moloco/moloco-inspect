import React from 'react';
import { DocsLayout, Breadcrumbs } from '../components/DocsLayout';
import type { UxWritingJson } from '../types';

export function UxWritingPage({
  uxWritingData,
}: {
  uxWritingData: UxWritingJson;
}) {
  const principleCount = uxWritingData.service_voice.principles.length;
  const surfaceRuleEntries = Object.entries(uxWritingData.surface_rules);
  const automatedCheckCount = uxWritingData.validation_process.automated_checks.length;
  const exampleCount = Object.values(uxWritingData.examples).reduce((sum, items) => sum + items.length, 0);

  return (
    <DocsLayout
      title="UX Writing"
      description="전체 서비스의 writing이 일관성과 전문성을 갖추도록 돕는 운영 가이드입니다."
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
        {
          title: 'Sections',
          items: [
            { label: 'Voice Principles', href: '#voice-principles', tone: 'sub' },
            { label: 'Surface Rules', href: '#surface-rules', tone: 'sub' },
            { label: 'Validation', href: '#validation', tone: 'sub' },
            { label: 'Examples', href: '#examples', tone: 'sub' },
          ],
        },
      ]}
    >
      <div className="docs-topbar">
        <Breadcrumbs items={['Documentation', 'UX Writing']} />
      </div>

      <section className="docs-hero">
        <div className="eyebrow">UX Writing</div>
        <h1>Make service writing clear, consistent, and reviewable</h1>
        <p>
          이 페이지는 버튼, 오류, 빈 상태, 다이얼로그 문구를 같은 기준으로 판단하기 위한 writing 가이드입니다.
          PM과 SA는 예제를 보고 빠르게 의도를 맞출 수 있고, 에이전트는 같은 규칙을 자동 검증에 사용합니다.
        </p>
      </section>

      <section className="docs-grid">
        <article className="docs-card span-3 stat">
          <div className="label">Voice Principles</div>
          <div className="value">{principleCount}</div>
          <div className="note">서비스 전반에 공통으로 적용하는 기본 문체</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Surface Rules</div>
          <div className="value">{surfaceRuleEntries.length}</div>
          <div className="note">버튼, 오류, 빈 상태, 다이얼로그별 문구 규칙</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Automated Checks</div>
          <div className="value">{automatedCheckCount}</div>
          <div className="note">validator가 warning으로 잡아주는 writing 규칙</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Examples</div>
          <div className="value">{exampleCount}</div>
          <div className="note">before / after 형태의 실제 writing 예제</div>
        </article>

        <article className="docs-section-card span-12" id="voice-principles">
          <div className="docs-section-head">
            <div>
              <h2>Voice principles</h2>
              <p className="docs-section-copy">서비스 전반에서 지켜야 하는 writing 기본 원칙입니다.</p>
            </div>
          </div>
          <div className="docs-grid compact-grid">
            {uxWritingData.service_voice.principles.map((principle) => (
              <article className="docs-card span-4" key={principle.id}>
                <h3>{principle.name}</h3>
                <p className="supporting-copy">{principle.rule}</p>
                {principle.good_examples ? (
                  <div className="writing-example-list">
                    <strong>Do</strong>
                    {Object.entries(principle.good_examples).map(([locale, examples]) => (
                      <p className="mono-note" key={`${principle.id}-${locale}-good`}>
                        {locale}: {examples.join(' \u00b7 ')}
                      </p>
                    ))}
                  </div>
                ) : null}
                {principle.avoid ? (
                  <div className="writing-example-list">
                    <strong>Avoid</strong>
                    {Object.entries(principle.avoid).map(([locale, examples]) => (
                      <p className="mono-note" key={`${principle.id}-${locale}-avoid`}>
                        {locale}: {examples.join(' \u00b7 ')}
                      </p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </article>

        <article className="docs-section-card span-12" id="surface-rules">
          <div className="docs-section-head">
            <div>
              <h2>Surface rules</h2>
              <p className="docs-section-copy">버튼, 오류, 빈 상태, 다이얼로그에서 특히 자주 쓰는 writing 기준입니다.</p>
            </div>
          </div>
          <div className="docs-grid compact-grid">
            {surfaceRuleEntries.map(([surface, rule]) => (
              <article className="docs-card span-6" key={surface}>
                <div className="docs-badge">{surface}</div>
                <h3>{rule.rule}</h3>
                {rule.guidance ? (
                  <ul className="flat-list">
                    {rule.guidance.map((item) => (
                      <li key={`${surface}-${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {rule.do ? (
                  <div className="writing-example-list">
                    <strong>Recommended</strong>
                    {Object.entries(rule.do).map(([locale, examples]) => (
                      <p className="mono-note" key={`${surface}-${locale}-do`}>
                        {locale}: {examples.join(' \u00b7 ')}
                      </p>
                    ))}
                  </div>
                ) : null}
                {rule.dont ? (
                  <div className="writing-example-list">
                    <strong>Avoid</strong>
                    {Object.entries(rule.dont).map(([locale, examples]) => (
                      <p className="mono-note" key={`${surface}-${locale}-dont`}>
                        {locale}: {examples.join(' \u00b7 ')}
                      </p>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </article>

        <article className="docs-section-card span-12" id="validation">
          <div className="docs-section-head">
            <div>
              <h2>Validation</h2>
              <p className="docs-section-copy">자동 검증과 사람이 직접 보는 리뷰를 함께 운영합니다.</p>
            </div>
          </div>
          <div className="docs-grid compact-grid">
            <article className="docs-card span-6">
              <h3>Automated checks</h3>
              <p className="supporting-copy">{uxWritingData.validation_process.automation_policy.rationale}</p>
              <ul className="flat-list">
                {uxWritingData.validation_process.automated_checks.map((check) => (
                  <li key={check.id}>
                    <strong>{check.id}</strong>: {check.description}
                  </li>
                ))}
              </ul>
            </article>
            <article className="docs-card span-6">
              <h3>Manual review</h3>
              <ul className="flat-list">
                {uxWritingData.validation_process.manual_review.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </div>
        </article>

        <article className="docs-section-card span-12" id="examples">
          <div className="docs-section-head">
            <div>
              <h2>Examples</h2>
              <p className="docs-section-copy">PM과 SA가 빠르게 판단할 수 있도록 before / after 예제를 함께 제공합니다.</p>
            </div>
          </div>
          <div className="docs-grid compact-grid">
            {Object.entries(uxWritingData.examples).flatMap(([group, examples]) =>
              examples.map((example) => (
                <article className="docs-card span-4" key={`${group}-${example.scenario}`}>
                  <div className="docs-badge">{group}</div>
                  <h3>{example.scenario}</h3>
                  <div className="writing-compare">
                    <div>
                      <strong>Before</strong>
                      <p className="mono-note">ko: {example.before.ko}</p>
                      <p className="mono-note">en: {example.before.en}</p>
                    </div>
                    <div>
                      <strong>After</strong>
                      <p className="mono-note">ko: {example.after.ko}</p>
                      <p className="mono-note">en: {example.after.en}</p>
                    </div>
                  </div>
                  <p className="supporting-copy">{example.why}</p>
                </article>
              )),
            )}
          </div>
        </article>
      </section>
    </DocsLayout>
  );
}

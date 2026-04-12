import React, { useMemo } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { DocsLayout, Breadcrumbs } from '../components/DocsLayout';
import type { ComponentsCatalog } from '../types';

export function ComponentDetailPage({ catalog }: { catalog: ComponentsCatalog }) {
  const { slug } = useParams();

  const component = useMemo(() => {
    for (const category of catalog.categories) {
      for (const comp of category.components) {
        const compSlug = comp.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
        if (compSlug === slug) return { ...comp, categoryName: category.name };
      }
    }
    return null;
  }, [catalog, slug]);

  if (!component) {
    return (
      <DocsLayout title="컴포넌트를 찾을 수 없습니다" description="">
        <div className="docs-topbar">
          <Breadcrumbs items={['Design System', 'Components', slug || '']} />
        </div>
        <section className="docs-hero">
          <h1>컴포넌트를 찾을 수 없습니다</h1>
          <p><NavLink to="/design/components">← 카탈로그로 돌아가기</NavLink></p>
        </section>
      </DocsLayout>
    );
  }

  return (
    <DocsLayout title={component.name} description={component.description}>
      <div className="docs-topbar">
        <Breadcrumbs items={['Design System', 'Components', component.name]} />
      </div>

      <section className="docs-hero">
        <div className="eyebrow">{component.categoryName} · {component.tierName || 'Component'}</div>
        <h1>{component.name}</h1>
        <p>{component.description}</p>
        {component.status ? <span className={`chip ${component.status}`}>{component.status}</span> : null}
      </section>

      <section className="docs-grid">
        {/* Stats row */}
        <article className="docs-card span-3 stat">
          <div className="label">Props</div>
          <div className="value">{component.propCount}</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Golden States</div>
          <div className="value">{component.goldenStates.length}</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Required Providers</div>
          <div className="value">{component.requiredProviders.length}</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Category</div>
          <div className="value" style={{fontSize: '16px'}}>{component.functionalCategory || '—'}</div>
        </article>

        {/* When to use / Avoid */}
        {(component.whenToUse && component.whenToUse.length > 0) || (component.doNotUse && component.doNotUse.length > 0) ? (
          <article className="docs-section-card span-12">
            <div className="docs-section-head">
              <div><h2>사용 가이드</h2></div>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px'}}>
              {component.whenToUse && component.whenToUse.length > 0 ? (
                <div>
                  <h3 style={{fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-success, #10b981)'}}>When to use</h3>
                  <ul style={{margin: 0, paddingLeft: '16px', fontSize: '13px', lineHeight: '1.7', color: 'var(--color-text-secondary, #64748b)'}}>
                    {component.whenToUse.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
              {component.doNotUse && component.doNotUse.length > 0 ? (
                <div>
                  <h3 style={{fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--color-error, #ef4444)'}}>Avoid when</h3>
                  <ul style={{margin: 0, paddingLeft: '16px', fontSize: '13px', lineHeight: '1.7', color: 'var(--color-text-secondary, #64748b)'}}>
                    {component.doNotUse.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          </article>
        ) : null}

        {/* Dependencies */}
        {(component.requiredProviders.length > 0 || component.mustBeInside.length > 0) ? (
          <article className="docs-section-card span-6">
            <div className="docs-section-head">
              <div><h2>의존성</h2></div>
            </div>
            {component.requiredProviders.length > 0 ? (
              <div style={{marginBottom: '12px'}}>
                <div style={{fontSize: '12px', fontWeight: 600, marginBottom: '6px'}}>Required Providers</div>
                <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                  {component.requiredProviders.map((p) => <span key={p} className="chip stable">{p}</span>)}
                </div>
              </div>
            ) : null}
            {component.mustBeInside.length > 0 ? (
              <div>
                <div style={{fontSize: '12px', fontWeight: 600, marginBottom: '6px'}}>Must be inside</div>
                <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                  {component.mustBeInside.map((p) => <span key={p} className="chip stable">{p}</span>)}
                </div>
              </div>
            ) : null}
            {component.dependencyNotes ? (
              <p style={{fontSize: '12px', color: 'var(--color-text-tertiary)', marginTop: '8px'}}>{component.dependencyNotes}</p>
            ) : null}
          </article>
        ) : null}

        {/* Golden States */}
        {component.goldenStates.length > 0 ? (
          <article className="docs-section-card span-6">
            <div className="docs-section-head">
              <div><h2>Golden States</h2></div>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
              {component.goldenStates.map((state, i) => (
                <div key={i} style={{padding: '10px 12px', background: 'var(--color-bg-tertiary, #f3f4f6)', borderRadius: '8px'}}>
                  <div style={{fontSize: '13px', fontWeight: 600}}>{state.name}</div>
                  <div style={{fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px'}}>{state.description}</div>
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {/* Implementation notes */}
        {component.notes && component.notes.length > 0 ? (
          <article className="docs-section-card span-12">
            <div className="docs-section-head">
              <div><h2>구현 참고사항</h2></div>
            </div>
            <ul style={{margin: 0, paddingLeft: '16px', fontSize: '13px', lineHeight: '1.7', color: 'var(--color-text-secondary)'}}>
              {component.notes.map((note, i) => <li key={i}>{note}</li>)}
            </ul>
          </article>
        ) : null}

        {/* Recipe code */}
        {component.recipeCode ? (
          <article className="docs-section-card span-12">
            <div className="docs-section-head">
              <div><h2>Preview Recipe</h2><p className="docs-section-copy">{component.recipeDescription}</p></div>
            </div>
            <pre style={{margin: 0, padding: '16px', background: 'var(--color-bg-tertiary)', borderRadius: '8px', fontSize: '12px', overflow: 'auto'}}>
              <code>{component.recipeCode}</code>
            </pre>
          </article>
        ) : null}

        {/* Back link */}
        <div className="span-12" style={{marginTop: '16px'}}>
          <NavLink to="/design/components" style={{fontSize: '13px'}}>← 카탈로그로 돌아가기</NavLink>
        </div>
      </section>
    </DocsLayout>
  );
}

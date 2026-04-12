import React, { useMemo, useState } from 'react';
import { DocsLayout, Breadcrumbs } from '../components/DocsLayout';
import type { ComponentCategory, ComponentEntry, ComponentsCatalog } from '../types';
import { slugify, featuredNames, runtimePreviewNames, previewNode } from '../utils';

export function ComponentsPage({
  componentsCatalog,
}: {
  componentsCatalog: ComponentsCatalog;
}) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();

    return componentsCatalog.categories
      .map((category) => {
        if (selectedCategory !== 'all' && category.name !== selectedCategory) {
          return null;
        }

        const filteredComponents = category.components.filter((component) => {
          const haystack = [
            component.name,
            component.description,
            component.shortDescription,
            component.functionalCategory,
            component.importPath,
            ...(component.whenToUse ?? []),
            ...(component.doNotUse ?? []),
          ]
            .join(' ')
            .toLowerCase();

          return !query || haystack.includes(query);
        });

        if (!filteredComponents.length) {
          return null;
        }

        return {
          ...category,
          components: filteredComponents,
        };
      })
      .filter(Boolean) as ComponentCategory[];
  }, [search, selectedCategory, componentsCatalog.categories]);

  const visibleComponents = useMemo(
    () => filteredCategories.flatMap((category) => category.components),
    [filteredCategories],
  );

  const featuredComponents = useMemo(
    () =>
      featuredNames
        .map((name) => visibleComponents.find((component) => component.name === name))
        .filter(Boolean) as ComponentEntry[],
    [visibleComponents],
  );

  const visibleFormikCount = useMemo(
    () => visibleComponents.filter((component) => component.formikRequired).length,
    [visibleComponents],
  );

  return (
    <DocsLayout
      title="Components"
      description="MSM Portal 서비스에서 실제로 쓰는 공통 UI 컴포넌트를 검색하고 훑어보는 React 기반 카탈로그입니다."
    >
      <div className="docs-topbar">
        <Breadcrumbs items={['Components', 'Catalog']} />
      </div>

      <section className="docs-hero">
        <div className="eyebrow">Component Catalog</div>
        <h1>Search the MSM Portal component inventory</h1>
        <p>
          디자인 시스템 JSON에 담긴 컴포넌트를 사람이 훑기 쉬운 문서 형태로 바꾸고, 대표 컴포넌트는 바로
          눈으로 비교할 수 있도록 프리뷰를 함께 붙였습니다. 이제 각 카드에서 provider, Formik 제약,
          preview recipe까지 같이 확인할 수 있습니다.
        </p>
      </section>

      <section className="docs-grid">
        <article className="docs-card span-3 stat">
          <div className="label">Categories</div>
          <div className="value">{componentsCatalog.meta.totalCategories}</div>
          <div className="note">현재 카탈로그에 분류된 기능 그룹 수</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Visible Results</div>
          <div className="value">{visibleComponents.length}</div>
          <div className="note">검색과 카테고리 조건을 만족하는 컴포넌트 수</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Formik Bound</div>
          <div className="value">{visibleFormikCount}</div>
          <div className="note">Formik 컨텍스트 안에서 써야 하는 폼 컴포넌트 수</div>
        </article>
        <article className="docs-card span-3 stat">
          <div className="label">Source</div>
          <div className="value">Live JSON</div>
          <div className="note">components.json과 component-dependencies.json을 함께 읽습니다</div>
        </article>

        <article className="docs-section-card span-12">
          <div className="docs-section-head">
            <div>
              <h2>Browse the catalog</h2>
              <p className="docs-section-copy">
                필터를 바꾸면 Featured, 사이드바, 결과 카드가 모두 같은 상태를 보도록 맞췄습니다.
              </p>
            </div>
          </div>
          <div className="control-row">
            <input
              className="search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, usage, or import path"
              type="search"
              value={search}
            />
            <select
              className="select"
              onChange={(event) => setSelectedCategory(event.target.value)}
              value={selectedCategory}
            >
              <option value="all">All categories</option>
              {componentsCatalog.categories.map((category) => (
                <option key={category.name} value={category.name}>
                  {category.name} ({category.count})
                </option>
              ))}
            </select>
          </div>
        </article>

        <article className="docs-section-card span-12">
          <div className="docs-section-head">
            <div>
              <h2>Featured</h2>
              <p className="docs-section-copy">대표 컴포넌트는 검색과 카테고리 필터 결과 안에서만 보여줍니다.</p>
            </div>
          </div>
          {featuredComponents.length ? (
            <div className="featured-grid">
              {featuredComponents.map((component) => (
                <article className="featured-card" key={component.name}>
                  <div className="preview-surface">
                    <div className="preview-stage">{previewNode(component)}</div>
                  </div>
                  <div>
                    <h3>{component.name}</h3>
                    <p>{component.shortDescription ?? component.description}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">No featured components matched this filter.</div>
          )}
        </article>

        {filteredCategories.length ? (
          filteredCategories.map((category) => (
            <article
              className="docs-section-card span-12"
              id={`category-${slugify(category.name)}`}
              key={category.name}
            >
              <div className="docs-section-head">
                <div>
                  <h2>{category.name}</h2>
                  <p className="docs-section-copy">{category.description}</p>
                </div>
                <div className="docs-badge">{category.components.length} results</div>
              </div>
              <div className="catalog-grid">
                {category.components.map((component) => {
                  const whenToUse = (component.whenToUse ?? []).slice(0, 2);
                  const doNotUse = (component.doNotUse ?? []).slice(0, 2);

                  return (
                    <article className="component-card" key={component.name}>
                      <div className="component-top">
                        <div className="preview-surface">
                          <div className="preview-stage">{previewNode(component)}</div>
                        </div>
                        <div>
                          <h3>{component.name}</h3>
                          <p>{component.shortDescription ?? component.description}</p>
                        </div>
                      </div>
                      <div className="component-meta">
                        {component.status ? <span className="chip stable">{component.status}</span> : null}
                        {runtimePreviewNames.has(component.name) ? <span className="chip core">Runtime</span> : null}
                        {component.tierName ? <span className="chip">{component.tierName}</span> : null}
                        {component.functionalCategory ? <span className="chip">{component.functionalCategory}</span> : null}
                        {component.formikRequired ? <span className="chip formik">Formik</span> : null}
                        <span className="chip">{component.propCount} props</span>
                      </div>
                      <div className="list-rows">
                        <div className="meta-row">
                          <div className="meta-label">Import</div>
                          <div className="meta-value">
                            <code>{component.importPath ?? component.path ?? 'N/A'}</code>
                          </div>
                        </div>
                        {whenToUse.length ? (
                          <div className="meta-row">
                            <div className="meta-label">When to use</div>
                            <ul className="component-list">
                              {whenToUse.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {doNotUse.length ? (
                          <div className="meta-row">
                            <div className="meta-label">Avoid when</div>
                            <ul className="component-list">
                              {doNotUse.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {component.requiredProviders.length ? (
                          <div className="meta-row">
                            <div className="meta-label">Required providers</div>
                            <div className="chip-row">
                              {component.requiredProviders.map((provider) => (
                                <span className="chip provider required" key={provider}>
                                  {provider}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {component.optionalProviders.length ? (
                          <div className="meta-row">
                            <div className="meta-label">Optional helpers</div>
                            <div className="chip-row">
                              {component.optionalProviders.map((provider) => (
                                <span className="chip provider optional" key={provider}>
                                  {provider}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {component.mustBeInside.length ? (
                          <div className="meta-row">
                            <div className="meta-label">Must be inside</div>
                            <div className="chip-row">
                              {component.mustBeInside.map((constraint) => (
                                <span className="chip constraint" key={constraint}>
                                  {constraint}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {component.dependencyNotes ? (
                          <div className="meta-row">
                            <div className="meta-label">Dependency note</div>
                            <div className="meta-value component-note">{component.dependencyNotes}</div>
                          </div>
                        ) : null}
                        {component.notes?.length ? (
                          <div className="meta-row">
                            <div className="meta-label">Implementation notes</div>
                            <ul className="component-list">
                              {component.notes.slice(0, 2).map((note) => (
                                <li key={note}>{note}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {component.recipeDescription ? (
                          <div className="meta-row">
                            <div className="meta-label">Preview recipe</div>
                            <div className="recipe-block">
                              <p>{component.recipeDescription}</p>
                              {component.recipeProviders?.length ? (
                                <div className="chip-row">
                                  {component.recipeProviders.map((provider) => (
                                    <span className="chip recipe" key={provider}>
                                      {provider}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              {component.recipeCode ? (
                                <details className="recipe-details">
                                  <summary>Show setup code</summary>
                                  <pre>
                                    <code>{component.recipeCode}</code>
                                  </pre>
                                </details>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        {component.goldenStates.length ? (
                          <div className="meta-row">
                            <div className="meta-label">Golden states</div>
                            <div className="golden-state-list">
                              {component.goldenStates.map((state) => (
                                <div className="golden-state-item" key={`${component.name}-${state.name}`}>
                                  <div className="golden-state-name">{state.name}</div>
                                  <div className="golden-state-description">{state.description}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="component-footer">
                        <div className="component-path">{component.path ?? component.importPath ?? 'N/A'}</div>
                        <div className="chip-row">
                          {component.example ? <span className="chip stable">Example available</span> : null}
                          {component.recipeKey ? <span className="chip recipe">Recipe linked</span> : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state span-12">No components matched this search yet.</div>
        )}
      </section>
    </DocsLayout>
  );
}

import React, { Fragment, Suspense, lazy, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useParams } from 'react-router-dom';
import foundationsColorsJson from '../data/site/foundations-colors.json';
import componentsJson from '@source-design-system/components.json';
import componentDependenciesJson from '@source-design-system/component-dependencies.json';
import goldenExampleStatesJson from '@source-design-system/golden-example-states.json';
import uxWritingJson from '@source-design-system/ux-writing.json';
import validationRunnerJson from '@source-design-system/validation-runner.json';

type ComponentEntry = {
  name: string;
  description: string;
  shortDescription?: string;
  status?: string;
  tierName?: string;
  functionalCategory?: string;
  importPath?: string;
  path?: string;
  formikRequired?: boolean;
  propCount: number;
  whenToUse?: string[];
  doNotUse?: string[];
  example?: string;
  notes?: string[];
  requiredProviders: string[];
  optionalProviders: string[];
  mustBeInside: string[];
  dependencyNotes?: string;
  recipeKey?: string;
  recipeDescription?: string;
  recipeProviders?: string[];
  recipeCode?: string;
  goldenStates: Array<{ name: string; description: string }>;
};

type ComponentCategory = {
  name: string;
  description: string;
  count: number;
  components: ComponentEntry[];
};

type ComponentsCatalog = {
  meta: {
    totalCategories: number;
    totalComponents: number;
  };
  categories: ComponentCategory[];
};

type TokenValue = {
  hex: string;
  semantic: string | string[];
  source?: string;
  usage?: string;
  lightEquivalent?: string;
};

type PaletteSection = Record<string, TokenValue | string>;

type FoundationsData = {
  meta: { generatedAt: string; description: string };
  modes: Array<'light' | 'dark'>;
  sections: string[];
  light: Record<string, PaletteSection>;
  dark: Record<string, PaletteSection>;
};

type LiveComponentProp = {
  name: string;
};

type LiveComponentEntry = {
  name: string;
  description: string;
  shortDescription?: string;
  functional_category?: string;
  status?: string;
  tier?: string | number;
  importPath?: string;
  path?: string;
  formikRequired?: boolean;
  when_to_use?: string[];
  do_not_use?: string[];
  example?: string;
  states?: Array<{ name: string; description?: string }>;
  props?: LiveComponentProp[];
  notes?: string[];
};

type LiveComponentCategory = {
  name: string;
  description: string;
  components: LiveComponentEntry[];
};

type LiveComponentsJson = {
  meta: {
    tiers?: Record<string, { name: string }>;
  };
  categories: LiveComponentCategory[];
};

type DependencyComponentEntry = {
  requires?: string[];
  optional?: string[];
  must_be_inside?: string[];
  notes?: string;
};

type RenderingRecipe = {
  description: string;
  providers: string[];
  code: string;
};

type ComponentDependenciesJson = {
  components: Record<string, DependencyComponentEntry>;
  rendering_recipes: Record<string, RenderingRecipe>;
};

type ValidationRunnerJson = {
  checks?: {
    contract?: Array<{ id: string }>;
  };
};

type GoldenExampleStatesJson = {
  components: Record<string, { golden_states?: Array<{ name: string; description: string }> }>;
};

type UxWritingJson = {
  service_voice: {
    principles: Array<{
      id: string;
      name: string;
      rule: string;
      good_examples?: Record<string, string[]>;
      avoid?: Record<string, string[]>;
    }>;
    terminology: {
      recommended: Array<{ concept: string; ko: string; en: string }>;
      consistency_rule: string;
    };
  };
  surface_rules: Record<
    string,
    {
      rule: string;
      guidance?: string[];
      do?: Record<string, string[]>;
      dont?: Record<string, string[]>;
    }
  >;
  validation_process: {
    automation_policy: {
      rationale: string;
    };
    automated_checks: Array<{ id: string; description: string }>;
    manual_review: string[];
  };
  examples: Record<
    string,
    Array<{
      scenario: string;
      before: { ko: string; en: string };
      after: { ko: string; en: string };
      why: string;
    }>
  >;
};

const liveComponentsJson = componentsJson as LiveComponentsJson;
const componentDependenciesData = componentDependenciesJson as ComponentDependenciesJson;
const goldenExampleStatesData = goldenExampleStatesJson as GoldenExampleStatesJson;
const uxWritingData = uxWritingJson as UxWritingJson;
const validationRunnerData = validationRunnerJson as ValidationRunnerJson;
const foundationsData = foundationsColorsJson as unknown as FoundationsData;
const runtimePreviewNames = new Set([
  'MCButton2',
  'MCBarTabs',
  'MCStatus',
  'MCContentLayout',
  'MCFormTextInput',
  'MCFormCheckBox',
  'MCFormSwitchInput',
  'MCFormRadioGroup',
]);
const LazyRuntimePreview = lazy(() =>
  import('./runtime/RuntimePreview').then((module) => ({ default: module.RuntimePreview })),
);
const LazyAnalyticsOverviewSection = lazy(() =>
  import('./analytics/AnalyticsPanels').then((module) => ({ default: module.AnalyticsOverviewSection })),
);
const LazyAnalyticsDetailSection = lazy(() =>
  import('./analytics/AnalyticsPanels').then((module) => ({ default: module.AnalyticsDetailSection })),
);

const featuredNames = ['MCButton2', 'MCFormTextInput', 'MCBarTabs', 'MCContentLayout'];
const contractRuleCount = validationRunnerData.checks?.contract?.length ?? 0;
const draftedContractCount = 5;

const sectionMeta: Record<string, { title: string; badge: string; description: string }> = {
  text: {
    title: 'Label',
    badge: 'Foreground',
    description: '텍스트와 전경 요소에 쓰는 색상입니다. 계층, 강조, 상태 표현을 위한 기본 토큰이 이 그룹에 들어갑니다.',
  },
  background: {
    title: 'Background',
    badge: 'Surface',
    description: '패널, 입력창, 카드, 상태 배경처럼 뒤쪽 면을 구성하는 색상입니다.',
  },
  border: {
    title: 'Line - Normal',
    badge: 'Divider',
    description: '구분선과 기본 보더처럼 요소 간 경계를 나눌 때 사용하는 라인 계열 색상입니다.',
  },
  border_semantic: {
    title: 'Line - Semantic',
    badge: 'State Border',
    description: '포커스, 에러, 성공처럼 상태 의미를 직접 전달하는 보더 색상입니다.',
  },
  icon: {
    title: 'Icon',
    badge: 'Symbol',
    description: '아이콘, 액션 심볼, 상태 심볼처럼 시각적 보조 요소에 사용되는 색상입니다.',
  },
};

function slugify(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

function formatSemantic(semantic: string | string[]) {
  return Array.isArray(semantic) ? semantic.join(', ') : semantic;
}

function getContrastText(hex: string) {
  if (!hex || hex === 'transparent') return '#172033';
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return '#172033';
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 165 ? '#172033' : '#ffffff';
}

function getRecipeKey(component: LiveComponentEntry) {
  if (component.name === 'MCButton2') return 'standalone_button';
  if (component.name === 'MCContentLayout') return 'content_layout_preview';
  if (component.formikRequired) return 'form_input_preview';
  if (['MCSignInForm', 'MCTFAForm', 'MCForgotPasswordForm', 'MCPostForgotPassword'].includes(component.name)) {
    return 'auth_sign_in_preview';
  }
  if (['MCWorkplaceSelector', 'MCWorkplaceSelectorPopper'].includes(component.name)) {
    return 'workplace_selector_preview';
  }
  if (component.name.startsWith('MCAdPacingDashboard')) {
    return 'ad_pacing_dashboard_preview';
  }
  return undefined;
}

function buildComponentsCatalog(
  liveComponents: LiveComponentsJson,
  dependencyJson: ComponentDependenciesJson,
  goldenStatesJson: GoldenExampleStatesJson,
): ComponentsCatalog {
  const categories = liveComponents.categories.map((category) => {
    const components = category.components.map((component) => {
      const tierName =
        component.tier !== undefined
          ? liveComponents.meta.tiers?.[String(component.tier)]?.name
          : undefined;
      const dependency = dependencyJson.components[component.name] ?? {};
      const recipeKey = getRecipeKey(component);
      const recipe = recipeKey ? dependencyJson.rendering_recipes[recipeKey] : undefined;
      const goldenStates =
        goldenStatesJson.components[component.name]?.golden_states ??
        (component.states ?? []).map((state) => ({
          name: state.name,
          description: state.description ?? 'Documented component state',
        }));

      return {
        name: component.name,
        description: component.description,
        shortDescription: component.shortDescription,
        status: component.status,
        tierName,
        functionalCategory: component.functional_category,
        importPath: component.importPath,
        path: component.path,
        formikRequired: component.formikRequired,
        propCount: component.props?.length ?? 0,
        whenToUse: component.when_to_use ?? [],
        doNotUse: component.do_not_use ?? [],
        example: component.example,
        notes: component.notes ?? [],
        requiredProviders: dependency.requires ?? [],
        optionalProviders: dependency.optional ?? [],
        mustBeInside: dependency.must_be_inside ?? [],
        dependencyNotes: dependency.notes,
        recipeKey,
        recipeDescription: recipe?.description,
        recipeProviders: recipe?.providers ?? [],
        recipeCode: recipe?.code,
        goldenStates,
      };
    });

    return {
      name: category.name,
      description: category.description,
      count: components.length,
      components,
    };
  });

  return {
    meta: {
      totalCategories: categories.length,
      totalComponents: categories.reduce((sum, category) => sum + category.components.length, 0),
    },
    categories,
  };
}

const componentsCatalog = buildComponentsCatalog(
  liveComponentsJson,
  componentDependenciesData,
  goldenExampleStatesData,
);
const dependencyCoverageCount = Object.keys(componentDependenciesData.components).length;

function previewNode(component: ComponentEntry) {
  const name = component.name;
  const category = component.functionalCategory;

  const genericInput = (
    <div className="preview-input-shell">
      <div className="preview-input-label">Field label</div>
      <div className="preview-input">Type a value</div>
      <div className="preview-input-hint">Helper description for the field</div>
    </div>
  );

  const genericLayout = (
    <div className="preview-layout-shell">
      <div className="preview-layout-header">
        <div>
          <div className="preview-breadcrumb">Section / Group</div>
          <div className="preview-layout-title">Layout title</div>
        </div>
        <div className="preview-button primary">Action</div>
      </div>
      <div className="preview-panel" />
    </div>
  );

  const previewMap: Record<string, React.ReactNode> = {
    MCButton2: (
      <div className="preview-button-row">
        <div className="preview-button primary">Create campaign</div>
        <div className="preview-button secondary">Cancel</div>
        <div className="preview-button ghost">More</div>
      </div>
    ),
    MCFormTextInput: (
      <div className="preview-input-shell">
        <div className="preview-input-label">Campaign title</div>
        <div className="preview-input focused">Brand awareness launch</div>
        <div className="preview-input-hint">Used as the internal display name</div>
      </div>
    ),
    MCFormTextArea: (
      <div className="preview-input-shell">
        <div className="preview-input-label">Description</div>
        <div className="preview-panel">
          Add a short summary for stakeholders. This field supports multi-line content.
        </div>
      </div>
    ),
    MCFormCheckBox: (
      <div className="preview-checkbox-shell">
        <div className="preview-checkbox-option">
          <div className="preview-checkbox-box checked">✓</div>
          <span>Include remarketing users</span>
        </div>
        <div className="preview-checkbox-option">
          <div className="preview-checkbox-box" />
          <span>Exclude existing customers</span>
        </div>
      </div>
    ),
    MCFormSwitchInput: (
      <div className="preview-inline-row">
        <span className="preview-input-label">Live delivery enabled</span>
        <div className="preview-switch on">
          <div className="preview-switch-knob" />
        </div>
      </div>
    ),
    MCFormRadioGroup: (
      <div className="preview-radio-shell">
        <div className="preview-radio-option">
          <div className="preview-radio-dot active" />
          <span>CPC</span>
        </div>
        <div className="preview-radio-option">
          <div className="preview-radio-dot" />
          <span>CPM</span>
        </div>
      </div>
    ),
    MCRadioGroup: (
      <div className="preview-radio-shell">
        <div className="preview-radio-option">
          <div className="preview-radio-dot active" />
          <span>Overview</span>
        </div>
        <div className="preview-radio-option">
          <div className="preview-radio-dot" />
          <span>History</span>
        </div>
      </div>
    ),
    MCBarTabs: (
      <div className="preview-tabs">
        <div className="preview-tab active">Overview</div>
        <div className="preview-tab">Creative</div>
        <div className="preview-tab">Settings</div>
      </div>
    ),
    MCStatus: (
      <div className="preview-status-row">
        <div className="preview-pill active">Healthy</div>
        <div className="preview-pill warning">Pending</div>
        <div className="preview-pill error">Rejected</div>
      </div>
    ),
    MCStatusBadge: (
      <div className="preview-status-row">
        <div className="preview-pill active">Active</div>
        <div className="preview-pill muted">Paused</div>
      </div>
    ),
    MCColorPicker: (
      <div className="preview-color-picker">
        <div className="preview-color-trigger">
          <div className="preview-color-swatch" />
          <strong>#346BEA</strong>
        </div>
        <div className="preview-picker-panel">
          <div className="preview-gradient" />
          <div className="preview-slider" />
        </div>
      </div>
    ),
    MCTableActionBar: (
      <div className="preview-actionbar">
        <div className="preview-counter">24 selected</div>
        <div className="preview-button-row">
          <div className="preview-button secondary">Export</div>
          <div className="preview-button primary">Apply action</div>
        </div>
      </div>
    ),
    MCI18nTable: (
      <div className="preview-table-shell">
        <div className="preview-table">
          <div className="preview-table-head">
            <span>Metric</span>
            <span>Status</span>
            <span>Value</span>
          </div>
          <div className="preview-table-row">
            <span>CTR</span>
            <span>Healthy</span>
            <span>2.3%</span>
          </div>
          <div className="preview-table-row">
            <span>Spend</span>
            <span>Warning</span>
            <span>$2,310</span>
          </div>
        </div>
      </div>
    ),
    MCContentLayout: (
      <div className="preview-layout-shell">
        <div className="preview-layout-header">
          <div>
            <div className="preview-breadcrumb">Campaign / List</div>
            <div className="preview-layout-title">Campaign overview</div>
          </div>
          <div className="preview-button primary">Create</div>
        </div>
        <div className="preview-tabs">
          <div className="preview-tab active">Available</div>
          <div className="preview-tab">Archived</div>
        </div>
        <div className="preview-panel" />
      </div>
    ),
    MCAccordion: (
      <div className="preview-layout-shell">
        <div className="preview-panel">
          <div className="preview-inline-row">
            <strong>Advanced settings</strong>
            <span className="preview-mini-note">Expanded</span>
          </div>
        </div>
        <div className="preview-panel" />
      </div>
    ),
    MCCommonDialog: (
      <div className="preview-dialog-shell">
        <div className="preview-dialog-title">Delete creative</div>
        <div className="preview-dialog-copy">This action cannot be undone.</div>
        <div className="preview-button-row">
          <div className="preview-button secondary">Cancel</div>
          <div className="preview-button primary">Delete</div>
        </div>
      </div>
    ),
    MCFormLayout: (
      <div className="preview-layout-shell">
        <div className="preview-breadcrumb">Order / New order</div>
        <div className="preview-panel">
          <div className="preview-layout-title">Full page form</div>
          <div className="preview-mini-note">Header, body panel, footer actions</div>
        </div>
      </div>
    ),
    MCReportTable: (
      <div className="preview-table-shell">
        <div className="preview-actionbar">
          <div className="preview-counter">Performance report</div>
          <div className="preview-button ghost">Download CSV</div>
        </div>
        <div className="preview-table">
          <div className="preview-table-head">
            <span>Date</span>
            <span>Clicks</span>
            <span>Spend</span>
          </div>
          <div className="preview-table-row">
            <span>2026-04-09</span>
            <span>932</span>
            <span>$1,204</span>
          </div>
          <div className="preview-table-row">
            <span>2026-04-10</span>
            <span>876</span>
            <span>$1,119</span>
          </div>
        </div>
      </div>
    ),
    MCFormPortal: (
      <div className="preview-layout-shell">
        <div className="preview-panel preview-portal-panel">
          <div className="preview-breadcrumb">Portal-mounted surface</div>
          <div className="preview-layout-title preview-layout-title-small">Full-screen form overlay</div>
          <div className="preview-mini-note preview-mini-note-margin">Rendered above the main layout body.</div>
        </div>
      </div>
    ),
  };

  if (runtimePreviewNames.has(name)) {
    return (
      <Suspense
        fallback={
          previewMap[name] ??
          (category === 'input'
            ? genericInput
            : category === 'layout'
              ? genericLayout
              : (
                <div className="preview-panel preview-panel-small">
                  <div className="preview-mini-note">Loading live preview...</div>
                </div>
              ))
        }
      >
        <LazyRuntimePreview name={name as never} />
      </Suspense>
    );
  }

  if (previewMap[name]) {
    return previewMap[name];
  }
  if (category === 'input') {
    return genericInput;
  }
  if (category === 'layout') {
    return genericLayout;
  }
  if (category === 'display') {
    return (
      <div className="preview-status-row">
        <div className="preview-pill muted">{name}</div>
      </div>
    );
  }
  if (category === 'navigation') {
    return (
      <div className="preview-tabs">
        <div className="preview-tab active">Section</div>
        <div className="preview-tab">Menu</div>
      </div>
    );
  }
  if (category === 'feedback') {
    return <div className="preview-panel preview-panel-small" />;
  }
  return (
    <div className="preview-panel preview-panel-small">
      <div className="preview-mini-note">{name} preview surface</div>
    </div>
  );
}

type SidebarLinkItem = {
  label: string;
  to?: string;
  href?: string;
  active?: boolean;
  tone?: 'default' | 'sub';
};

function DocsLayout({
  title,
  description,
  sidebarGroups,
  children,
}: {
  title: string;
  description: string;
  sidebarGroups: Array<{ title: string; items?: SidebarLinkItem[]; chips?: string[] }>;
  children: React.ReactNode;
}) {
  return (
    <main className="docs-shell">
      <aside className="docs-sidebar">
        <div className="sidebar-brand">
          <div className="eyebrow">MSM Portal DS</div>
          <h1 className="sidebar-title">{title}</h1>
          <p className="sidebar-copy">{description}</p>
        </div>

        <nav className="sidebar-nav">
          {sidebarGroups.map((group) => (
            <div className="sidebar-group" key={group.title}>
              <div className="sidebar-group-title">{group.title}</div>
              {group.items ? (
                <div className="sidebar-list">
                  {group.items.map((item) => {
                    if (item.to) {
                      return (
                        <NavLink
                          end={item.to === '/'}
                          key={`${group.title}-${item.label}`}
                          className={({ isActive }) =>
                            `${item.tone === 'sub' ? 'sidebar-sublink' : 'sidebar-link'}${isActive || item.active ? ' active' : ''}`
                          }
                          to={item.to}
                        >
                          {item.label}
                        </NavLink>
                      );
                    }
                    return (
                      <a
                        className={`${item.tone === 'sub' ? 'sidebar-sublink' : 'sidebar-link'}${item.active ? ' active' : ''}`}
                        href={item.href}
                        key={`${group.title}-${item.label}`}
                      >
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              ) : null}
              {group.chips ? (
                <div className="sidebar-chip-list">
                  {group.chips.map((chip) => (
                    <span className="chip stable" key={chip}>
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
      </aside>
      <section className="docs-main">{children}</section>
    </main>
  );
}

function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <div className="docs-crumbs">
      {items.map((item, index) => (
        <Fragment key={`${item}-${index}`}>
          <span>{item}</span>
          {index < items.length - 1 ? <span>/</span> : null}
        </Fragment>
      ))}
    </div>
  );
}

function AnalyticsDetailPage() {
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

function ProgressPage() {
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

function DesignSystemHomePage() {
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

function FoundationsColorsPage() {
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
            tone: 'sub',
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

function UxWritingPage() {
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
                        {locale}: {examples.join(' · ')}
                      </p>
                    ))}
                  </div>
                ) : null}
                {principle.avoid ? (
                  <div className="writing-example-list">
                    <strong>Avoid</strong>
                    {Object.entries(principle.avoid).map(([locale, examples]) => (
                      <p className="mono-note" key={`${principle.id}-${locale}-avoid`}>
                        {locale}: {examples.join(' · ')}
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
                        {locale}: {examples.join(' · ')}
                      </p>
                    ))}
                  </div>
                ) : null}
                {rule.dont ? (
                  <div className="writing-example-list">
                    <strong>Avoid</strong>
                    {Object.entries(rule.dont).map(([locale, examples]) => (
                      <p className="mono-note" key={`${surface}-${locale}-dont`}>
                        {locale}: {examples.join(' · ')}
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

function ComponentsPage() {
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
  }, [search, selectedCategory]);

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

  const sidebarCategoryNames = filteredCategories.map((category) => category.name);
  const activeSidebarCategory =
    selectedCategory !== 'all' ? selectedCategory : (sidebarCategoryNames[0] ?? '');

  return (
    <DocsLayout
      title="Components"
      description="MSM Portal 서비스에서 실제로 쓰는 공통 UI 컴포넌트를 검색하고 훑어보는 React 기반 카탈로그입니다."
      sidebarGroups={[
        {
          title: 'Overview',
          items: [
            { label: 'Design System Home', to: '/design-system' },
            { label: 'Foundations / Colors', to: '/foundations/colors' },
            { label: 'Components', to: '/components' },
            { label: 'UX Writing', to: '/ux-writing' },
          ],
        },
        {
          title: 'Categories',
          items: sidebarCategoryNames.map((category) => ({
            label: category,
            href: `#category-${slugify(category)}`,
            active: category === activeSidebarCategory,
            tone: 'sub',
          })),
        },
      ]}
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

export function App() {
  return (
    <Routes>
      <Route element={<ProgressPage />} path="/" />
      <Route element={<ProgressPage />} path="/progress" />
      <Route element={<AnalyticsDetailPage />} path="/analytics/request/:requestId" />
      <Route element={<DesignSystemHomePage />} path="/design-system" />
      <Route element={<FoundationsColorsPage />} path="/foundations/colors" />
      <Route element={<ComponentsPage />} path="/components" />
      <Route element={<UxWritingPage />} path="/ux-writing" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

import React, { Suspense, lazy } from 'react';
import type {
  ComponentEntry,
  ComponentsCatalog,
  ComponentDependenciesJson,
  GoldenExampleStatesJson,
  LiveComponentEntry,
  LiveComponentsJson,
  ValidationRunnerJson,
} from './types';

import validationRunnerJson from '@source-design-system/validation-runner.json';

const validationRunnerData = validationRunnerJson as ValidationRunnerJson;

const LazyRuntimePreview = lazy(() =>
  import('./runtime/RuntimePreview').then((module) => ({ default: module.RuntimePreview })),
);

export const runtimePreviewNames = new Set([
  'MCButton2',
  'MCBarTabs',
  'MCStatus',
  'MCContentLayout',
  'MCFormTextInput',
  'MCFormCheckBox',
  'MCFormSwitchInput',
  'MCFormRadioGroup',
]);

export const featuredNames = ['MCButton2', 'MCFormTextInput', 'MCBarTabs', 'MCContentLayout'];

export const contractRuleCount = validationRunnerData.checks?.contract?.length ?? 0;
export const draftedContractCount = 5;

export const sectionMeta: Record<string, { title: string; badge: string; description: string }> = {
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

export function slugify(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

export function formatSemantic(semantic: string | string[]) {
  return Array.isArray(semantic) ? semantic.join(', ') : semantic;
}

export function getContrastText(hex: string) {
  if (!hex || hex === 'transparent') return '#172033';
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return '#172033';
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 165 ? '#172033' : '#ffffff';
}

export function getRecipeKey(component: LiveComponentEntry) {
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

export function buildComponentsCatalog(
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

export function previewNode(component: ComponentEntry) {
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
          <div className="preview-checkbox-box checked">{'\u2713'}</div>
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

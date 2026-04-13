import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import componentsJson from '@design-system/components.json';
import componentDependenciesJson from '@design-system/component-dependencies.json';
import goldenExampleStatesJson from '@design-system/golden-example-states.json';
import uxWritingJson from '@design-system/ux-writing.json';
import governanceJson from '@design-system/governance.json';
import patternsJson from '@design-system/patterns.json';
import foundationsColorsJson from '../data/foundations-colors.json';
import tokensJson from '@design-system/tokens.json';
import stateMachinesJson from '@design-system/state-machines.json';
import componentBehaviorsJson from '@design-system/component-behaviors.json';
import codeExamplesJson from '@design-system-workflows/code-examples.json';
import errorPatternsJson from '@design-system-workflows/error-patterns.json';
import uxCriteriaJson from '@design-system-workflows/ux-criteria.json';

import type {
  ComponentDependenciesJson,
  ComponentBehaviorsJson,
  FoundationsData,
  GoldenExampleStatesJson,
  GovernanceJson,
  LiveComponentsJson,
  PatternsJson,
  StateMachinesJson,
  TokensJson,
  UxWritingJson,
  CodeExamplesJson,
  ErrorPatternsJson,
  UxCriteriaJson,
} from './types';
import { buildComponentsCatalog } from './utils';
import { DSLayout } from './components/DSLayout';

// Keep OverviewPage as eager (landing page)
import { OverviewPage } from './pages/OverviewPage';

// Lazy load other pages
const TokensPage = lazy(() => import('./pages/TokensPage').then(m => ({ default: m.TokensPage })));
const ComponentsPage = lazy(() => import('./pages/ComponentsPage').then(m => ({ default: m.ComponentsPage })));
const ComponentDetailPage = lazy(() => import('./pages/ComponentDetailPage').then(m => ({ default: m.ComponentDetailPage })));
const PatternsPage = lazy(() => import('./pages/PatternsPage').then(m => ({ default: m.PatternsPage })));
const UxWritingPage = lazy(() => import('./pages/UxWritingPage').then(m => ({ default: m.UxWritingPage })));
const GovernancePage = lazy(() => import('./pages/GovernancePage').then(m => ({ default: m.GovernancePage })));
const BlocksPage = lazy(() => import('./pages/BlocksPage').then(m => ({ default: m.BlocksPage })));

const catalog = buildComponentsCatalog(
  componentsJson as LiveComponentsJson,
  componentDependenciesJson as ComponentDependenciesJson,
  goldenExampleStatesJson as GoldenExampleStatesJson,
);
const foundationsData = foundationsColorsJson as unknown as FoundationsData;
const tokensData = tokensJson as TokensJson;
const uxWritingData = uxWritingJson as UxWritingJson;
const governanceData = governanceJson as GovernanceJson;
const patternsData = patternsJson as PatternsJson;
const stateMachinesData = stateMachinesJson as StateMachinesJson;
const behaviorsData = componentBehaviorsJson as ComponentBehaviorsJson;
const depCount = Object.keys((componentDependenciesJson as ComponentDependenciesJson).components).length;
const codeExamplesData = codeExamplesJson as unknown as CodeExamplesJson;
const errorPatternsData = errorPatternsJson as unknown as ErrorPatternsJson;
const uxCriteriaData = uxCriteriaJson as unknown as UxCriteriaJson;

export function App() {
  return (
    <DSLayout catalog={catalog}>
      <Suspense fallback={<div className="loading-state">Loading...</div>}>
        <Routes>
          <Route path="/" element={
            <OverviewPage catalog={catalog} depCount={depCount} governanceData={governanceData} />
          } />
          <Route path="/tokens" element={<TokensPage colorsData={foundationsData} tokensData={tokensData} />} />
          <Route path="/foundations/colors" element={<Navigate to="/tokens" replace />} />
          <Route path="/components" element={<ComponentsPage catalog={catalog} />} />
          <Route path="/components/:slug" element={<ComponentDetailPage catalog={catalog} stateMachines={stateMachinesData} behaviors={behaviorsData} />} />
          <Route path="/patterns" element={<PatternsPage data={patternsData} codeExamples={codeExamplesData} />} />
          <Route path="/blocks" element={<BlocksPage patterns={patternsData} catalog={catalog} />} />
          <Route path="/ux-writing" element={<UxWritingPage data={uxWritingData} />} />
          <Route path="/governance" element={<GovernancePage data={governanceData} errorPatterns={errorPatternsData} uxCriteria={uxCriteriaData} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </DSLayout>
  );
}

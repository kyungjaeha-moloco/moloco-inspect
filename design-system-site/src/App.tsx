import React from 'react';
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

import type {
  ComponentDependenciesJson,
  FoundationsData,
  GoldenExampleStatesJson,
  GovernanceJson,
  LiveComponentsJson,
  PatternsJson,
  UxWritingJson,
} from './types';
import { buildComponentsCatalog } from './utils';
import { DSLayout } from './components/DSLayout';

import { OverviewPage } from './pages/OverviewPage';
import { TokensPage } from './pages/TokensPage';
import { ComponentsPage } from './pages/ComponentsPage';
import { ComponentDetailPage } from './pages/ComponentDetailPage';
import { PatternsPage } from './pages/PatternsPage';
import { UxWritingPage } from './pages/UxWritingPage';
import { GovernancePage } from './pages/GovernancePage';

const catalog = buildComponentsCatalog(
  componentsJson as LiveComponentsJson,
  componentDependenciesJson as ComponentDependenciesJson,
  goldenExampleStatesJson as GoldenExampleStatesJson,
);
const foundationsData = foundationsColorsJson as unknown as FoundationsData;
const tokensData = tokensJson as any;
const uxWritingData = uxWritingJson as UxWritingJson;
const governanceData = governanceJson as GovernanceJson;
const patternsData = patternsJson as PatternsJson;
const stateMachinesData = stateMachinesJson as any;
const behaviorsData = componentBehaviorsJson as any;
const depCount = Object.keys((componentDependenciesJson as ComponentDependenciesJson).components).length;

export function App() {
  return (
    <DSLayout>
      <Routes>
        <Route path="/" element={
          <OverviewPage catalog={catalog} depCount={depCount} governanceData={governanceData} />
        } />
        <Route path="/tokens" element={<TokensPage colorsData={foundationsData} tokensData={tokensData} />} />
        <Route path="/foundations/colors" element={<Navigate to="/tokens" replace />} />
        <Route path="/components" element={<ComponentsPage catalog={catalog} />} />
        <Route path="/components/:slug" element={<ComponentDetailPage catalog={catalog} stateMachines={stateMachinesData} behaviors={behaviorsData} />} />
        <Route path="/patterns" element={<PatternsPage data={patternsData} />} />
        <Route path="/ux-writing" element={<UxWritingPage data={uxWritingData} />} />
        <Route path="/governance" element={<GovernancePage data={governanceData} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DSLayout>
  );
}

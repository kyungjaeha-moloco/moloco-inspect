import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import foundationsColorsJson from '../data/site/foundations-colors.json';
import componentsJson from '@source-design-system/components.json';
import componentDependenciesJson from '@source-design-system/component-dependencies.json';
import goldenExampleStatesJson from '@source-design-system/golden-example-states.json';
import uxWritingJson from '@source-design-system/ux-writing.json';

import type {
  ComponentDependenciesJson,
  FoundationsData,
  GoldenExampleStatesJson,
  LiveComponentsJson,
  UxWritingJson,
} from './types';
import { buildComponentsCatalog } from './utils';

import { ProgressPage } from './pages/ProgressPage';
import { DesignSystemHomePage } from './pages/DesignSystemPage';
import { FoundationsColorsPage } from './pages/FoundationsPage';
import { ComponentsPage } from './pages/ComponentsPage';
import { UxWritingPage } from './pages/UxWritingPage';
import { AnalyticsDetailPage } from './pages/AnalyticsDetailPage';

const liveComponentsJson = componentsJson as LiveComponentsJson;
const componentDependenciesData = componentDependenciesJson as ComponentDependenciesJson;
const goldenExampleStatesData = goldenExampleStatesJson as GoldenExampleStatesJson;
const uxWritingData = uxWritingJson as UxWritingJson;
const foundationsData = foundationsColorsJson as unknown as FoundationsData;

const componentsCatalog = buildComponentsCatalog(
  liveComponentsJson,
  componentDependenciesData,
  goldenExampleStatesData,
);
const dependencyCoverageCount = Object.keys(componentDependenciesData.components).length;

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <ProgressPage
            componentsCatalog={componentsCatalog}
            dependencyCoverageCount={dependencyCoverageCount}
          />
        }
      />
      <Route
        path="/progress"
        element={
          <ProgressPage
            componentsCatalog={componentsCatalog}
            dependencyCoverageCount={dependencyCoverageCount}
          />
        }
      />
      <Route path="/analytics/request/:requestId" element={<AnalyticsDetailPage />} />
      <Route
        path="/design-system"
        element={
          <DesignSystemHomePage
            foundationsData={foundationsData}
            componentsCatalog={componentsCatalog}
            dependencyCoverageCount={dependencyCoverageCount}
            uxWritingData={uxWritingData}
          />
        }
      />
      <Route
        path="/foundations/colors"
        element={<FoundationsColorsPage foundationsData={foundationsData} />}
      />
      <Route
        path="/components"
        element={<ComponentsPage componentsCatalog={componentsCatalog} />}
      />
      <Route
        path="/ux-writing"
        element={<UxWritingPage uxWritingData={uxWritingData} />}
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

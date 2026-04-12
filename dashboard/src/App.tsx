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
import { ComponentDetailPage } from './pages/ComponentDetailPage';
import { UxWritingPage } from './pages/UxWritingPage';
import { AnalyticsDetailPage } from './pages/AnalyticsDetailPage';
import { RequestListPage } from './pages/RequestListPage';

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
      {/* Ops Hub */}
      <Route path="/" element={<Navigate to="/ops" replace />} />
      <Route
        path="/ops"
        element={
          <ProgressPage
            componentsCatalog={componentsCatalog}
            dependencyCoverageCount={dependencyCoverageCount}
          />
        }
      />
      <Route
        path="/ops/requests"
        element={<RequestListPage />}
      />
      <Route path="/ops/requests/:requestId" element={<AnalyticsDetailPage />} />
      <Route
        path="/ops/progress"
        element={
          <ProgressPage
            componentsCatalog={componentsCatalog}
            dependencyCoverageCount={dependencyCoverageCount}
          />
        }
      />

      {/* Design System */}
      <Route
        path="/design"
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
        path="/design/foundations"
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
        path="/design/foundations/colors"
        element={<FoundationsColorsPage foundationsData={foundationsData} />}
      />
      <Route
        path="/design/components"
        element={<ComponentsPage componentsCatalog={componentsCatalog} />}
      />
      <Route
        path="/design/components/:slug"
        element={<ComponentDetailPage catalog={componentsCatalog} />}
      />
      <Route
        path="/design/ux-writing"
        element={<UxWritingPage uxWritingData={uxWritingData} />}
      />

      {/* Legacy redirects */}
      <Route path="/design-system" element={<Navigate to="/design" replace />} />
      <Route path="/components" element={<Navigate to="/design/components" replace />} />
      <Route path="/foundations/colors" element={<Navigate to="/design/foundations/colors" replace />} />
      <Route path="/ux-writing" element={<Navigate to="/design/ux-writing" replace />} />
      <Route path="/analytics/request/:requestId" element={<Navigate to="/ops/requests/:requestId" replace />} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/ops" replace />} />
    </Routes>
  );
}

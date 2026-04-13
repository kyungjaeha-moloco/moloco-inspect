import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import componentsJson from '@source-design-system/components.json';
import componentDependenciesJson from '@source-design-system/component-dependencies.json';
import goldenExampleStatesJson from '@source-design-system/golden-example-states.json';

import type {
  ComponentDependenciesJson,
  GoldenExampleStatesJson,
  LiveComponentsJson,
} from './types';
import { buildComponentsCatalog } from './utils';
import { OpsLayout } from './components/OpsLayout';

import { OverviewPage } from './pages/OverviewPage';
import { RequestsPage } from './pages/RequestsPage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { SettingsPage } from './pages/SettingsPage';

const liveComponentsJson = componentsJson as LiveComponentsJson;
const componentDependenciesData = componentDependenciesJson as ComponentDependenciesJson;
const goldenExampleStatesData = goldenExampleStatesJson as GoldenExampleStatesJson;

const componentsCatalog = buildComponentsCatalog(
  liveComponentsJson,
  componentDependenciesData,
  goldenExampleStatesData,
);

const dependencyCoverageCount = Object.keys(componentDependenciesData.components).length;

export function App() {
  return (
    <OpsLayout>
      <Routes>
        <Route
          path="/"
          element={
            <OverviewPage
              totalComponents={componentsCatalog.meta.totalComponents}
              totalCategories={componentsCatalog.meta.totalCategories}
              dependencyCoverageCount={dependencyCoverageCount}
            />
          }
        />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/requests/:requestId" element={<RequestDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Legacy redirects */}
        <Route path="/ops" element={<Navigate to="/" replace />} />
        <Route path="/ops/*" element={<Navigate to="/" replace />} />
        <Route path="/tasks" element={<Navigate to="/" replace />} />
        <Route path="/design/*" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </OpsLayout>
  );
}

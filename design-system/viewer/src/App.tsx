import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './layout/Layout';
import { OverviewPage } from './pages/OverviewPage';
import { TokensPage } from './pages/TokensPage';
import { ComponentsPage } from './pages/ComponentsPage';
import { PatternsPage } from './pages/PatternsPage';
import { ConventionsPage } from './pages/ConventionsPage';
import { ApiContractsPage } from './pages/ApiContractsPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/tokens" element={<TokensPage />} />
        <Route path="/components" element={<ComponentsPage />} />
        <Route path="/patterns" element={<PatternsPage />} />
        <Route path="/conventions" element={<ConventionsPage />} />
        <Route path="/api-contracts" element={<ApiContractsPage />} />
      </Route>
    </Routes>
  );
}

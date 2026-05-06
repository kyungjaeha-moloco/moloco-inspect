import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { OpsLayout } from './components/OpsLayout';

import { OverviewPage } from './pages/OverviewPage';
import { RequestsPage } from './pages/RequestsPage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { JobsPage } from './pages/JobsPage';
import { JobDetailPage } from './pages/JobDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { MollyMetricsPage } from './pages/MollyMetricsPage';

export function App() {
  return (
    <OpsLayout>
      <Routes>
        <Route
          path="/"
          element={<OverviewPage />}
        />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:jobId" element={<JobDetailPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/requests/:requestId" element={<RequestDetailPage />} />
        <Route path="/molly" element={<MollyMetricsPage />} />
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

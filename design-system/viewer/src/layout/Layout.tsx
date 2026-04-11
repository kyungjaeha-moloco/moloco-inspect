import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: darkMode ? '#0D0F14' : '#FAFAFA',
      color: darkMode ? '#F1F5F9' : '#111827',
    }}>
      <Sidebar darkMode={darkMode} />
      <div style={{ flex: 1, marginLeft: 260 }}>
        <header style={{
          height: 56,
          borderBottom: `1px solid ${darkMode ? '#252A36' : '#E5E7EB'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          background: darkMode ? '#161A23' : '#FFFFFF',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: -0.3,
            }}>
              MSM Portal <span style={{ color: '#2563EB' }}>Design System</span>
            </span>
            <span style={{
              width: 1, height: 20,
              background: darkMode ? '#252A36' : '#E5E7EB',
            }} />
            <span style={{ fontSize: 12, color: darkMode ? '#94A3B8' : '#6B7280' }}>
              Live Component Viewer
            </span>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{
              width: 34, height: 34,
              border: `1px solid ${darkMode ? '#252A36' : '#E5E7EB'}`,
              borderRadius: 6,
              background: darkMode ? '#0D0F14' : '#FAFAFA',
              color: darkMode ? '#94A3B8' : '#6B7280',
              cursor: 'pointer',
              fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {darkMode ? '\u2600' : '\u263E'}
          </button>
        </header>
        <main style={{ padding: 32, maxWidth: 1100 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

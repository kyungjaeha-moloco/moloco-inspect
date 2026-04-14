import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../navigation';
import { APP_VERSION } from '../constants';

/* ---------- Theme helpers ---------- */
type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem('ops-theme') as Theme) || 'light';
  }
  return 'light';
}

const SunIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.9 8.6a6 6 0 01-6.5-6.5A6 6 0 108 14a6 6 0 005.9-5.4z" />
  </svg>
);

const ICONS: Record<string, React.ReactNode> = {
  overview: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  requests: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M5 6h6M5 9h4" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M13.5 8a5.5 5.5 0 01-.3 1.8l1.3.8-1 1.7-1.3-.8a5.5 5.5 0 01-1.5.9V14h-2v-1.6a5.5 5.5 0 01-1.5-.9l-1.3.8-1-1.7 1.3-.8A5.5 5.5 0 014.5 8a5.5 5.5 0 01.3-1.8L3.5 5.4l1-1.7 1.3.8a5.5 5.5 0 011.5-.9V2h2v1.6a5.5 5.5 0 011.5.9l1.3-.8 1 1.7-1.3.8a5.5 5.5 0 01.2 1.8z" />
    </svg>
  ),
};

export function OpsLayout({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ops-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <div className="sidebar-brand">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="var(--accent)">
            <rect width="18" height="18" rx="4" opacity="0.9" />
            <text x="4" y="13" fontSize="11" fontWeight="700" fill="var(--bg-base)">M</text>
          </svg>
          Inspect Hub
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `sidebar-item${isActive ? ' active' : ''}`
              }
            >
              {ICONS[item.icon]}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={toggleTheme} type="button">
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          <div style={{ padding: '0 12px', marginTop: 8 }}>
            Moloco Inspect v{APP_VERSION}
          </div>
        </div>
      </aside>
      <main className="ops-main">
        {children}
      </main>
    </div>
  );
}

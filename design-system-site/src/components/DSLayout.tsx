import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../navigation';

const ICONS: Record<string, React.ReactNode> = {
  overview: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  colors: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="5" r="1.5" fill="currentColor" />
      <circle cx="5.5" cy="9.5" r="1.5" fill="currentColor" />
      <circle cx="10.5" cy="9.5" r="1.5" fill="currentColor" />
    </svg>
  ),
  components: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <path d="M12 9v6M9 12h6" />
    </svg>
  ),
  patterns: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2h12v4H2zM2 10h5v4H2zM9 10h5v4H9z" />
    </svg>
  ),
  writing: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h12M2 7h8M2 11h10M2 15h6" />
    </svg>
  ),
  governance: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 1v14M1 8h14" />
      <circle cx="8" cy="8" r="6" />
    </svg>
  ),
};

export function DSLayout({ children }: { children: React.ReactNode }) {
  const _location = useLocation();

  // Group nav items by section
  const sections: Array<{ title: string | null; items: typeof NAV_ITEMS }> = [];
  let currentSection: string | null = null;
  let currentItems: typeof NAV_ITEMS = [];

  for (const item of NAV_ITEMS) {
    const section = item.section ?? null;
    if (section !== currentSection) {
      if (currentItems.length > 0) {
        sections.push({ title: currentSection, items: currentItems });
      }
      currentSection = section;
      currentItems = [];
    }
    currentItems.push(item);
  }
  if (currentItems.length > 0) {
    sections.push({ title: currentSection, items: currentItems });
  }

  return (
    <div className="ds-shell">
      <aside className="ds-sidebar">
        <div className="sidebar-brand">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect width="20" height="20" rx="4" fill="#0f62fe" />
            <text x="4.5" y="14.5" fontSize="12" fontWeight="700" fill="#fff">M</text>
          </svg>
          Design System
        </div>
        <nav className="sidebar-nav">
          {sections.map((section, si) => (
            <React.Fragment key={si}>
              {section.title && (
                <div className="sidebar-section-label">{section.title}</div>
              )}
              {section.items.map((item) => (
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
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-footer">
          Moloco Design System v0.1
        </div>
      </aside>
      <main className="ds-main">
        <div className="ds-content">
          {children}
        </div>
      </main>
    </div>
  );
}

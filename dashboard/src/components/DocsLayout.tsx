import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getAreaFromPath, getNavForArea } from '../navigation';

function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <div className="docs-crumbs">
      {items.map((item, index) => (
        <React.Fragment key={`${item}-${index}`}>
          <span>{item}</span>
          {index < items.length - 1 ? <span>/</span> : null}
        </React.Fragment>
      ))}
    </div>
  );
}

function DocsLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const area = getAreaFromPath(location.pathname);
  const navGroups = getNavForArea(area);

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="app-topbar">
        <div className="app-topbar-brand">Moloco Inspect</div>
        <nav className="app-topbar-tabs">
          <button
            className={`app-topbar-tab ${area === 'ops' ? 'active' : ''}`}
            onClick={() => navigate('/ops')}
          >
            Ops Hub
          </button>
          <button
            className={`app-topbar-tab ${area === 'design' ? 'active' : ''}`}
            onClick={() => navigate('/design')}
          >
            Design System
          </button>
        </nav>
        <div className="app-topbar-spacer" />
      </header>

      {/* Body: sidebar + main */}
      <div className="app-body">
        <aside className="app-sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title">{area === 'ops' ? 'Operations' : 'Design System'}</div>
          </div>
          <nav className="sidebar-nav">
            {navGroups.map((group) => (
              <div className="sidebar-group" key={group.title}>
                <div className="sidebar-group-title">{group.title}</div>
                <div className="sidebar-list">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/ops' || item.to === '/design'}
                      className={({ isActive }) =>
                        `sidebar-link${isActive ? ' active' : ''}`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="app-main">
          {children}
        </main>
      </div>
    </div>
  );
}

export { DocsLayout, Breadcrumbs };

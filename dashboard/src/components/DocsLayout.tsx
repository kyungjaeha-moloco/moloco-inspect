import React, { Fragment } from 'react';
import { NavLink } from 'react-router-dom';
import type { SidebarLinkItem } from '../types';

export function DocsLayout({
  title,
  description,
  sidebarGroups,
  children,
}: {
  title: string;
  description: string;
  sidebarGroups: Array<{ title: string; items?: SidebarLinkItem[]; chips?: string[] }>;
  children: React.ReactNode;
}) {
  return (
    <main className="docs-shell">
      <aside className="docs-sidebar">
        <div className="sidebar-brand">
          <div className="eyebrow">MSM Portal DS</div>
          <h1 className="sidebar-title">{title}</h1>
          <p className="sidebar-copy">{description}</p>
        </div>

        <nav className="sidebar-nav">
          {sidebarGroups.map((group) => (
            <div className="sidebar-group" key={group.title}>
              <div className="sidebar-group-title">{group.title}</div>
              {group.items ? (
                <div className="sidebar-list">
                  {group.items.map((item) => {
                    if (item.to) {
                      return (
                        <NavLink
                          end={item.to === '/'}
                          key={`${group.title}-${item.label}`}
                          className={({ isActive }) =>
                            `${item.tone === 'sub' ? 'sidebar-sublink' : 'sidebar-link'}${isActive || item.active ? ' active' : ''}`
                          }
                          to={item.to}
                        >
                          {item.label}
                        </NavLink>
                      );
                    }
                    return (
                      <a
                        className={`${item.tone === 'sub' ? 'sidebar-sublink' : 'sidebar-link'}${item.active ? ' active' : ''}`}
                        href={item.href}
                        key={`${group.title}-${item.label}`}
                      >
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              ) : null}
              {group.chips ? (
                <div className="sidebar-chip-list">
                  {group.chips.map((chip) => (
                    <span className="chip stable" key={chip}>
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
      </aside>
      <section className="docs-main">{children}</section>
    </main>
  );
}

export function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <div className="docs-crumbs">
      {items.map((item, index) => (
        <Fragment key={`${item}-${index}`}>
          <span>{item}</span>
          {index < items.length - 1 ? <span>/</span> : null}
        </Fragment>
      ))}
    </div>
  );
}

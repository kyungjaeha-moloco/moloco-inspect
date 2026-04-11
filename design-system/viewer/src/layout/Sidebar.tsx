import React from 'react';
import { NavLink } from 'react-router-dom';

const NAV_SECTIONS = [
  {
    title: 'OVERVIEW',
    items: [
      { label: 'Overview', path: '/overview', icon: '\u2302' },
    ],
  },
  {
    title: 'FOUNDATIONS',
    items: [
      { label: 'Tokens', path: '/tokens', icon: '\u25C6' },
    ],
  },
  {
    title: 'COMPONENTS',
    items: [
      { label: 'All Components', path: '/components', icon: '\u25A3' },
    ],
  },
  {
    title: 'PATTERNS',
    items: [
      { label: 'Patterns', path: '/patterns', icon: '\u29C9' },
    ],
  },
  {
    title: 'CONVENTIONS',
    items: [
      { label: 'Naming, Files, Imports, Architecture', path: '/conventions', icon: '\u2261' },
    ],
  },
  {
    title: 'API',
    items: [
      { label: 'API Contracts', path: '/api-contracts', icon: '\u21C4' },
    ],
  },
];

export function Sidebar({ darkMode }: { darkMode: boolean }) {
  const bg = darkMode ? '#161A23' : '#FFFFFF';
  const border = darkMode ? '#252A36' : '#E5E7EB';
  const textMuted = darkMode ? '#64748B' : '#9CA3AF';
  const textNormal = darkMode ? '#94A3B8' : '#6B7280';
  const accent = '#2563EB';
  const accentBg = darkMode ? '#1E3A5F' : '#EFF6FF';

  return (
    <nav style={{
      position: 'fixed',
      top: 0, left: 0, bottom: 0,
      width: 260,
      background: bg,
      borderRight: `1px solid ${border}`,
      overflowY: 'auto',
      zIndex: 20,
      paddingTop: 16,
    }}>
      <div style={{
        padding: '12px 16px 24px',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: -0.3,
      }}>
        <span style={{ color: accent }}>MSM</span> Design System
      </div>

      {NAV_SECTIONS.map((section) => (
        <div key={section.title} style={{ padding: '12px 0 4px' }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            color: textMuted,
            padding: '0 16px 6px',
          }}>
            {section.title}
          </div>
          {section.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 16px',
                fontSize: 13,
                color: isActive ? accent : textNormal,
                background: isActive ? accentBg : 'transparent',
                borderLeft: `2px solid ${isActive ? accent : 'transparent'}`,
                textDecoration: 'none',
                transition: 'background 150ms, color 150ms',
              })}
            >
              <span style={{ fontSize: 12 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

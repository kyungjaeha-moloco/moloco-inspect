export type NavItem = {
  label: string;
  to: string;
  icon: 'overview' | 'colors' | 'components' | 'patterns' | 'writing' | 'governance';
  section?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', to: '/', icon: 'overview' },
  { label: 'Tokens', to: '/tokens', icon: 'colors' },
  { label: 'Components', to: '/components', icon: 'components' },
  { label: 'Patterns', to: '/patterns', icon: 'patterns' },
  { label: 'UX Writing', to: '/ux-writing', icon: 'writing' },
  { label: 'Governance', to: '/governance', icon: 'governance' },
];

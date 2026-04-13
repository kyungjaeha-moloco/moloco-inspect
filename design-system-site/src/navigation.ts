export type NavItem = {
  label: string;
  to: string;
  icon: 'overview' | 'colors' | 'components' | 'patterns' | 'blocks' | 'writing' | 'governance' | 'architecture';
  section?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', to: '/', icon: 'overview' },
  { label: 'Architecture', to: '/architecture', icon: 'architecture' },
  { label: 'Tokens', to: '/tokens', icon: 'colors' },
  { label: 'Components', to: '/components', icon: 'components' },
  { label: 'Patterns', to: '/patterns', icon: 'patterns' },
  { label: 'Blocks', to: '/blocks', icon: 'blocks' },
  { label: 'UX Writing', to: '/ux-writing', icon: 'writing' },
  { label: 'Governance', to: '/governance', icon: 'governance' },
];

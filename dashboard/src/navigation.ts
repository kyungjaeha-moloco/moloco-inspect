export type NavItem = {
  label: string;
  to: string;
  icon: 'overview' | 'jobs' | 'requests' | 'settings';
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', to: '/', icon: 'overview' },
  { label: 'Jobs', to: '/jobs', icon: 'jobs' },
  { label: 'Requests', to: '/requests', icon: 'requests' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
];

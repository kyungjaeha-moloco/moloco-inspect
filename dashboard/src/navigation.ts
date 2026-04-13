export type NavItem = {
  label: string;
  to: string;
  icon: 'overview' | 'requests' | 'settings';
};

export const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', to: '/', icon: 'overview' },
  { label: 'Requests', to: '/requests', icon: 'requests' },
  { label: 'Settings', to: '/settings', icon: 'settings' },
];

export type NavItem = {
  label: string;
  to: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const OPS_NAV: NavGroup[] = [
  {
    title: 'Operations',
    items: [
      { label: '대시보드', to: '/ops' },
      { label: '요청 목록', to: '/ops/requests' },
      { label: '프로그램 진행', to: '/ops/progress' },
    ],
  },
];

export const DESIGN_NAV: NavGroup[] = [
  {
    title: 'Documentation',
    items: [
      { label: '개요', to: '/design' },
      { label: 'Foundations', to: '/design/foundations' },
      { label: '색상 토큰', to: '/design/foundations/colors' },
      { label: 'Components', to: '/design/components' },
      { label: 'UX Writing', to: '/design/ux-writing' },
    ],
  },
];

export function getAreaFromPath(pathname: string): 'ops' | 'design' {
  if (pathname.startsWith('/design')) return 'design';
  return 'ops';
}

export function getNavForArea(area: 'ops' | 'design'): NavGroup[] {
  return area === 'design' ? DESIGN_NAV : OPS_NAV;
}

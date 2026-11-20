import type { SVGProps } from 'react';

const PATHS: Record<string, string> = {
  dashboard: 'M3 3h6v7H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 12h6v5H3z',
  box: 'M3 7l7-4 7 4v6l-7 4-7-4zM3 7l7 4 7-4M10 11v6',
  cup: 'M4 7h9v5a4 4 0 01-4 4H8a4 4 0 01-4-4zM13 8h2a2 2 0 010 4h-2M4 19h10',
  receipt: 'M5 3h10v14l-2-1.5L11 17l-2-1.5L7 17l-2-1.5zM8 7h4M8 10h4',
  wallet: 'M3 6.5A2.5 2.5 0 015.5 4H15v3M3 6.5V15a2 2 0 002 2h11V7H5.5A2.5 2.5 0 013 6.5zM14 12h1',
  chart: 'M4 16V9M9 16V5M14 16v-5M3 18h15',
  flask: 'M8 3h4M9 3v5L5 15a2 2 0 001.8 3h6.4A2 2 0 0015 15L11 8V3M7 12h6',
  settings:
    'M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM16 10l1.2-.7-.8-1.4-1.3.5a5 5 0 00-1-1l.4-1.4-1.5-.6-.7 1.2h-1.5L10.1 5l-1.5.6.4 1.4a5 5 0 00-1 1L6.7 7.5l-.8 1.4L7.1 10v1.5l-1.2.7.8 1.4 1.3-.5a5 5 0 001 1l-.4 1.4 1.5.6.7-1.2h1.5l.7 1.2 1.5-.6-.4-1.4a5 5 0 001-1l1.3.5.8-1.4-1.2-.7z',
  menu: 'M3 5h14M3 10h14M3 15h14',
  close: 'M5 5l10 10M15 5L5 15',
  plus: 'M10 4v12M4 10h12',
  trash: 'M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11M9 9v5M11 9v5',
  edit: 'M13 4l3 3-8 8H5v-3zM11 6l3 3',
  download: 'M10 3v10M6 9l4 4 4-4M4 17h12',
  upload: 'M10 14V4M6 8l4-4 4 4M4 17h12',
  alert: 'M10 3l7 13H3zM10 8v3M10 13.5v.5',
  check: 'M4 10l4 4 8-8',
  history: 'M10 5v5l3 2M4 10a6 6 0 106-6 6 6 0 00-4.5 2M4 4v4h4',
  tag: 'M3 3h6l8 8-6 6-8-8zM7 7h.01',
  calculator: 'M5 3h10v14H5zM7 6h6M7 10h1M10 10h1M13 10h1M7 13h1M10 13h1M13 13h1',
  arrowRight: 'M4 10h11M11 6l4 4-4 4',
  external: 'M8 4H4v12h12v-4M11 3h6v6M17 3l-7 7',
  info: 'M10 9v5M10 6v.01M10 17a7 7 0 100-14 7 7 0 000 14z',
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: keyof typeof PATHS | string;
  size?: number;
}

export function Icon({ name, size = 18, className = '', ...rest }: IconProps) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d={path} />
    </svg>
  );
}

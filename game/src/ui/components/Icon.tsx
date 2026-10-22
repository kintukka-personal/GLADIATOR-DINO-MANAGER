// Inline SVG icon set (24×24, stroke 1.75, currentColor). No emoji anywhere in the UI.
import React from 'react';

const F = { fill: 'currentColor', stroke: 'none' } as const;

const ICONS = {
  coin: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5.6" opacity=".55" /><path d="M10 9.5h3.2a1.6 1.6 0 0 1 0 3.2H10.6m-.6 0h3.4a1.6 1.6 0 0 1 0 3.2H10V9.5" /></>,
  laurel: <><path d="M12 20c-4.6-1.3-7.4-5.2-7.2-10.6" /><path d="M12 20c4.6-1.3 7.4-5.2 7.2-10.6" /><path {...F} d="M5.2 8.6c-1.6-.6-2.4-2-2.2-3.6 1.6.2 2.6 1.4 2.6 3.2zM6.2 12.4c-1.8.1-3.1-.9-3.5-2.5 1.6-.3 3 .6 3.5 2.3zM8.4 15.6c-1.6.8-3.2.4-4.2-.9 1.4-.8 3-.4 4.2.9zM18.8 8.6c1.6-.6 2.4-2 2.2-3.6-1.6.2-2.6 1.4-2.6 3.2zM17.8 12.4c1.8.1 3.1-.9 3.5-2.5-1.6-.3-3 .6-3.5 2.3zM15.6 15.6c1.6.8 3.2.4 4.2-.9-1.4-.8-3-.4-4.2.9z" /></>,
  keeper: <><circle cx="12" cy="7.2" r="3.3" /><path d="M5.5 20.5c.4-4 3-6.6 6.5-6.6s6.1 2.6 6.5 6.6" /><path d="M8.5 13.9l3.5 3 3.5-3" /></>,
  egg: <><path d="M12 3.2c3.6 0 6.6 5.6 6.6 10.1A6.6 6.6 0 0 1 12 20.8a6.6 6.6 0 0 1-6.6-7.5C5.4 8.8 8.4 3.2 12 3.2z" /><circle {...F} cx="10" cy="11" r="1" /><circle {...F} cx="14.2" cy="14.4" r="1.1" /><circle {...F} cx="10.8" cy="16.2" r=".7" /></>,
  baby: <><path d="M12 4.5c3.4 0 5.6 3.5 5.6 7.2s-2.4 7.8-5.6 7.8-5.6-3.9-5.6-7.8S8.6 4.5 12 4.5z" /><path d="M7.4 9.2c1.4-1.6 3-2 4.6-.6 1.6-1.4 3.2-1 4.6.6" /><circle {...F} cx="10" cy="12.4" r="1" /><circle {...F} cx="14" cy="12.4" r="1" /><path d="M10.5 15.8c.9.6 2.1.6 3 0" /></>,
  heart: <><path d="M12 19.6s-7.4-4.5-7.4-9.7A4 4 0 0 1 12 7.7a4 4 0 0 1 7.4 2.2c0 5.2-7.4 9.7-7.4 9.7z" /></>,
  flame: <><path d="M12 21c-3.6 0-6-2.5-6-5.8 0-3.8 3.2-5.6 3.6-9.7 2.6 1.6 3.2 3.9 3 5.6 1-.8 1.6-2 1.7-3.2 2 1.6 3.7 4.2 3.7 7.2 0 3.4-2.4 5.9-6 5.9z" /><path d="M12 21c-1.6 0-2.6-1.1-2.6-2.6 0-1.8 1.6-2.6 2.3-4.4 1.5 1 2.9 2.6 2.9 4.4 0 1.5-1 2.6-2.6 2.6z" /></>,
  thermo: <><path d="M10 13.6V5.2a2 2 0 0 1 4 0v8.4a4 4 0 1 1-4 0z" /><circle {...F} cx="12" cy="17" r="1.9" /><path d="M12 15V9" strokeWidth="2.2" /><path d="M16.5 6.5h2M16.5 9.5h2M16.5 12.5h2" /></>,
  kibble: <><path d="M4.5 9.5l7.5-4 7.5 4v5l-7.5 4-7.5-4z" /><path d="M4.5 9.5l7.5 4 7.5-4M12 13.5v5" /></>,
  meat: <><path d="M14.6 4.8c3.4.4 5.4 3.4 4.4 6.6-.9 2.9-4 5-7.4 5.2l-2.9 2.9a1.6 1.6 0 1 1-2.2-2.2l-.4-.4a1.6 1.6 0 1 1 2.2-2.2l2.9-2.9c.3-3.6 2.4-7.3 3.4-7z" /><path d="M14.5 8.6c1.2.3 1.9 1.3 1.6 2.5" /></>,
  berries: <><circle cx="8.4" cy="15.2" r="3.2" /><circle cx="15.4" cy="15.6" r="3.2" /><circle cx="12" cy="10" r="3" /><path d="M12 7c0-2 1-3.4 3-4.2M12 7c-1.4-1.6-3.2-2-5-1.6" /></>,
  claw: <><path d="M5 19.5c1-6.4 4.8-12 12.6-15-2.4 3.8-3.6 7.6-3.6 11.4" /><path d="M9.4 19.6c.7-4 2.8-7.6 6.6-10.1" /><path d="M4 20.5h10" /></>,
  shield: <><path d="M12 3.5l7 2.6v5.5c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6.1z" /><path d="M12 7v10" opacity=".55" /></>,
  helmet: <><path d="M4.5 15.5a7.5 7.5 0 0 1 15 0v2h-15z" /><path d="M12 8V3.6M9.4 4.4c1.6-.9 3.6-.9 5.2 0" /><path d="M8.5 17.5v-3h7v3" /></>,
  armor: <><path d="M8 3.8L4.4 6v6c0 2.3.7 4.4 2 6.2l2.6 2.2h6l2.6-2.2c1.3-1.8 2-3.9 2-6.2V6L16 3.8c-.9 1.4-2.3 2.2-4 2.2s-3.1-.8-4-2.2z" /><path d="M7.6 10.5h8.8M7.8 14.5h8.4" opacity=".6" /></>,
  rider: <><circle cx="12.5" cy="4.8" r="2" /><path d="M12.5 7.2l-1.4 5.2 3.6.6 1.3 4" /><path d="M11.1 12.4l-3.3 1.2M3 20.5l18-14" /><path d="M5 19c2.4-2.2 6.8-2.6 10.8-1.2" opacity=".6" /></>,
  item: <><path d="M9 3.5h6M10 3.5v3.3L6.2 12.6a5.4 5.4 0 1 0 11.6 0L14 6.8V3.5" /><path d="M7.4 14h9.2" opacity=".6" /></>,
  trophy: <><path d="M7.5 4h9v4.6a4.5 4.5 0 0 1-9 0z" /><path d="M7.5 6H4.6c0 2.6 1.4 4 3.3 4.2M16.5 6h2.9c0 2.6-1.4 4-3.3 4.2" /><path d="M12 13.2v3.8M8.6 20h6.8M9.6 17h4.8l.4 3H9.2z" /></>,
  skull: <><path d="M12 3.5c4.4 0 7.4 3 7.4 7 0 2.4-1.2 4.2-2.8 5.2v3.8H7.4v-3.8C5.8 14.7 4.6 12.9 4.6 10.5c0-4 3-7 7.4-7z" /><circle {...F} cx="9.2" cy="11" r="1.7" /><circle {...F} cx="14.8" cy="11" r="1.7" /><path d="M10.4 19.5v-2.2M13.6 19.5v-2.2M12 13.6l-.9 1.6h1.8z" /></>,
  injury: <><path d="M8.4 4.4l11.2 11.2a2.4 2.4 0 0 1 0 3.4l-.6.6a2.4 2.4 0 0 1-3.4 0L4.4 8.4a2.4 2.4 0 0 1 0-3.4l.6-.6a2.4 2.4 0 0 1 3.4 0z" /><path d="M10 13l3-3M11.6 14.6l3-3M8.4 11.4l3-3" opacity=".7" /></>,
  star: <><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="1.6" /><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" /><path d="M12 14.4v2.4" /></>,
  arrow: <><path d="M4.5 12h14.5M13.5 6.5l5.5 5.5-5.5 5.5" /></>,
  back: <><path d="M19.5 12H5M10.5 6.5L5 12l5.5 5.5" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h11" /></>,
  advance: <><path d="M4.5 6.2l7 5.8-7 5.8z" /><path d="M12 6.2l7 5.8-7 5.8z" /></>,
  spy: <><path d="M3.5 10.5c2.6-.6 5.6-1 8.5-1s5.9.4 8.5 1" /><path d="M6.4 10l1.4-5.2c1.4.6 2.8.9 4.2.9s2.8-.3 4.2-.9l1.4 5.2" /><circle cx="8.2" cy="15.6" r="2.6" /><circle cx="15.8" cy="15.6" r="2.6" /><path d="M10.8 15.4c.8-.5 1.6-.5 2.4 0" /></>,
  scroll: <><path d="M7 4.5h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1z" /><path d="M7 16.5V4.5a2 2 0 0 0-2 2v1.8h2" /><path d="M10 9h4.5M10 12h4.5" opacity=".7" /></>,
  temple: <><path d="M3.5 9.2L12 4l8.5 5.2z" /><path d="M5 9.2h14M5.5 20h13M4.5 20.5h15" /><path d="M7 11v7.5M10.3 11v7.5M13.7 11v7.5M17 11v7.5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" /><circle cx="12" cy="12" r="6.2" /></>,
  male: <><circle cx="10" cy="14" r="5.2" /><path d="M13.8 10.2L19.5 4.5M14.5 4.5h5v5" /></>,
  female: <><circle cx="12" cy="9" r="5.2" /><path d="M12 14.2v6.6M8.8 17.8h6.4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  check: <><path d="M5 12.5l4.4 4.4L19 7.2" /></>,
  chevronDown: <><path d="M6 9.5l6 6 6-6" /></>,
  chevronUp: <><path d="M6 14.5l6-6 6 6" /></>,
  chevronRight: <><path d="M9.5 6l6 6-6 6" /></>,
  home: <><path d="M4 11l8-6.5 8 6.5" /><path d="M6 9.8V20h12V9.8" /><path d="M10 20v-5.5h4V20" /></>,
  gate: <><path d="M4 20V8.5L12 4l8 4.5V20" /><path d="M8.2 20v-6a3.8 3.8 0 0 1 7.6 0v6" /><path d="M3 20.5h18" /></>,
  amphora: <><path d="M9.5 3.5h5M10.2 3.5v2.6C7.6 7.4 6 10 6 13c0 3.8 2.6 7 6 7.5 3.4-.5 6-3.7 6-7.5 0-3-1.6-5.6-4.2-6.9V3.5" /><path d="M10.2 6.4C8 6.2 6.6 7.4 6.4 9.4M13.8 6.4c2.2-.2 3.6 1 3.8 3" /><path d="M7 13.5h10" opacity=".6" /></>,
  arena: <><ellipse cx="12" cy="8.5" rx="8.5" ry="3.2" /><path d="M3.5 8.5v7.2c0 1.8 3.8 3.3 8.5 3.3s8.5-1.5 8.5-3.3V8.5" /><path d="M7 11.4v6.8M12 11.8v7.2M17 11.4v6.8" opacity=".7" /></>,
  estate: <><path d="M3.5 20.5h17M5 20.5V11l4-3 4 3v9.5M13 20.5V8.5L17 5.5l2.5 2v13" /><path d="M8 14h2M8 17h2M15.5 11h1.5M15.5 14h1.5" /></>,
  finance: <><path d="M12 4v16M5 7.5h14" /><path d="M5 7.5L2.6 13a2.6 2.6 0 0 0 4.8 0zM19 7.5L16.6 13a2.6 2.6 0 0 0 4.8 0z" /><path d="M8.5 20h7" /></>,
  message: <><rect x="3.5" y="5.5" width="17" height="13" rx="1.6" /><path d="M4 6.5l8 6.2 8-6.2" /></>,
  bell: <><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.8H5z" /><path d="M10 20.2a2.2 2.2 0 0 0 4 0" /></>,
  flag: <><path d="M5.5 21V4" /><path d="M5.5 4.8c4.6-2.4 8 2.2 13 0v8.4c-5 2.2-8.4-2.4-13 0" /></>,
  horde: <><path d="M12 3.8c1.6 2.2 4.4 3.4 7 3.4-.4 6.6-3 11.2-7 13-4-1.8-6.6-6.4-7-13 2.6 0 5.4-1.2 7-3.4z" /><path d="M9 10.8l1.6 4.2L12 11.6l1.4 3.4L15 10.8" /></>,
  book: <><path d="M4 5.6c2.8-1.2 5.6-1.2 8 .6v13.2c-2.4-1.8-5.2-1.8-8-.6zM20 5.6c-2.8-1.2-5.6-1.2-8 .6v13.2c2.4-1.8 5.2-1.8 8-.6z" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.2" /><circle {...F} cx="12" cy="7.8" r="1.1" /></>,
  warning: <><path d="M12 4l9 15.5H3z" /><path d="M12 10v4.4" /><circle {...F} cx="12" cy="17" r="1.05" /></>,
  sort: <><path d="M7 4.5v15M3.8 7.7L7 4.5l3.2 3.2M17 19.5v-15M13.8 16.3l3.2 3.2 3.2-3.2" /></>,
  filter: <><path d="M4 5.5h16l-6.2 7.2v5.8l-3.6 1.8v-7.6z" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="1.5" /><path d="M15.5 8.5V5.8a1.3 1.3 0 0 0-1.3-1.3H5.8a1.3 1.3 0 0 0-1.3 1.3v8.4a1.3 1.3 0 0 0 1.3 1.3h2.7" /></>,
  upload: <><path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9" /><path d="M4.5 15v3.8a1.2 1.2 0 0 0 1.2 1.2h12.6a1.2 1.2 0 0 0 1.2-1.2V15" /></>,
  dna: <><path d="M7 3.5c0 6 10 7 10 17M17 3.5c0 6-10 7-10 17" /><path d="M8.6 7h6.8M9.6 10h4.8M9.6 14h4.8M8.6 17h6.8" opacity=".7" /></>,
  mutation: <><path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z" /><path d="M18 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" /></>,
  tree: <><rect x="9" y="3.5" width="6" height="4.5" rx="1" /><rect x="3.5" y="16" width="6" height="4.5" rx="1" /><rect x="14.5" y="16" width="6" height="4.5" rx="1" /><path d="M12 8v4M6.5 16v-4h11v4" /></>,
  eye: <><path d="M2.8 12s3.4-6.2 9.2-6.2 9.2 6.2 9.2 6.2-3.4 6.2-9.2 6.2S2.8 12 2.8 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  moon: <><path d="M19 14.6A7.6 7.6 0 1 1 9.4 5a6 6 0 0 0 9.6 9.6z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" /></>,
  sparkle: <><path d="M12 3.5c.6 4.4 2.8 7.2 8 8.5-5.2 1.3-7.4 4.1-8 8.5-.6-4.4-2.8-7.2-8-8.5 5.2-1.3 7.4-4.1 8-8.5z" /></>,
  anvil: <><path d="M3.5 7.5h13.5c0 2.6-2 4.4-4.6 4.6v1.4l2.6 3H9l2.6-3V12c-4 0-6.4-1.8-8.1-4.5z" /><path d="M17 7.5h3.5M7 20.5h10" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" /><circle {...F} cx="12" cy="12" r="1.6" /></>,
  hourglass: <><path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5c0 4.4 4.5 5.6 4.5 8.5s-4.5 4.1-4.5 8.5M16.5 3.5c0 4.4-4.5 5.6-4.5 8.5s4.5 4.1 4.5 8.5" /></>,
  swap: <><path d="M4.5 8h13M14 4.5L17.5 8 14 11.5M19.5 16h-13M10 12.5L6.5 16l3.5 3.5" /></>,
  save: <><path d="M5 4h11.5L20 7.5V20H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  dice: <><rect x="4.5" y="4.5" width="15" height="15" rx="2.5" /><circle {...F} cx="9" cy="9" r="1.2" /><circle {...F} cx="15" cy="15" r="1.2" /><circle {...F} cx="15" cy="9" r="1.2" /><circle {...F} cx="9" cy="15" r="1.2" /></>,
  drop: <><path d="M12 3.8c3 4 5.6 7.2 5.6 10.4a5.6 5.6 0 0 1-11.2 0c0-3.2 2.6-6.4 5.6-10.4z" /></>,
  pause: <><path d="M8.5 5.5v13M15.5 5.5v13" /></>,
  play: <><path d="M7 5l12 7-12 7z" /></>,
  skip: <><path d="M5.5 5.5l9 6.5-9 6.5zM18 5.5v13" /></>,
  paw: <><circle cx="7.2" cy="9.4" r="1.8" /><circle cx="10.6" cy="6" r="1.8" /><circle cx="14.6" cy="6.2" r="1.8" /><circle cx="17.6" cy="9.8" r="1.8" /><path d="M12.4 11.2c2.6 0 5 3.4 5 5.6 0 1.6-1.4 2.6-2.8 2.2-1-.3-1.4-.6-2.2-.6s-1.2.3-2.2.6c-1.4.4-2.8-.6-2.8-2.2 0-2.2 2.4-5.6 5-5.6z" /></>,
} as const;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 20, className, title, strokeWidth = 1.75, style }: IconProps) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={style}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {ICONS[name]}
    </svg>
  );
}

export function SexIcon({ sex, size = 16 }: { sex: 'M' | 'F'; size?: number }) {
  return (
    <span className={`sex sex-${sex}`} title={sex === 'M' ? 'Male' : 'Female'}>
      <Icon name={sex === 'M' ? 'male' : 'female'} size={size} strokeWidth={2} />
      <span className="sr-only">{sex === 'M' ? 'Male' : 'Female'}</span>
    </span>
  );
}

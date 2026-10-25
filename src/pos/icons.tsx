// Simple line icons approximating the BLUU POS glyphs.
import type { ReactNode } from 'react';

interface P {
  size?: number;
  color?: string;
  stroke?: number;
}

function Svg({ size = 32, color = '#222', stroke = 2, children }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export const IconForkSpoon = (p: P) => (
  <Svg {...p}>
    <path d="M9 4v8a3 3 0 0 0 6 0V4M12 4v24" />
    <ellipse cx="22" cy="9" rx="3.5" ry="5.5" />
    <path d="M22 14.5V28" />
  </Svg>
);

export const IconPerson = (p: P) => (
  <Svg {...p}>
    <circle cx="16" cy="10" r="6" />
    <path d="M5 29c1-7 5.5-10 11-10s10 3 11 10" />
  </Svg>
);

export const IconGuests = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="10" r="5" />
    <path d="M3 28c.8-6 4.5-9 9-9 2.6 0 4.8 1 6.3 3" />
    <path d="M22 16v12M20 16v4a2 2 0 0 0 4 0v-4M27.5 16c-1.5 0-2 2-2 4s1 2.5 2 2.5V28" />
  </Svg>
);

export const IconPrinter = (p: P) => (
  <Svg {...p}>
    <path d="M9 12V5h14v7" />
    <rect x="4" y="12" width="24" height="11" rx="3" />
    <path d="M9 20h14v8H9z" />
  </Svg>
);

export const IconReceiptDollar = (p: P) => (
  <Svg {...p}>
    <path d="M7 4h18v24l-3-2-3 2-3-2-3 2-3-2-3 2z" />
    <path d="M19 10.5c-.6-1-1.8-1.5-3-1.5-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2-1.3 0-2.5-.6-3-1.6M16 7.5v2M16 19v2" />
  </Svg>
);

export const IconCash = (p: P) => (
  <Svg {...p}>
    <rect x="6" y="9" width="23" height="14" rx="1" />
    <path d="M3 12v14h22" />
    <circle cx="17.5" cy="16" r="2.5" />
    <path d="M10 16h2M23 16h2" />
  </Svg>
);

export const IconCard = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="7" width="26" height="18" rx="2.5" />
    <path d="M3 12h26M7 20h6" />
    <circle cx="22" cy="20" r="1.6" fill={p.color ?? '#222'} />
    <circle cx="24.5" cy="20" r="1.6" fill={p.color ?? '#222'} />
  </Svg>
);

export const IconTerminal = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="3" width="15" height="26" rx="2" />
    <rect x="10" y="6" width="9" height="7" />
    <path d="M10 17h2M14 17h2M10 21h2M14 21h2M10 25h6M22 9h3v9h-3" />
  </Svg>
);

export const IconHeadset = (p: P) => (
  <Svg {...p}>
    <path d="M6 20v-4a10 10 0 0 1 20 0v4" />
    <rect x="4" y="18" width="5" height="9" rx="1.5" />
    <rect x="23" y="18" width="5" height="9" rx="1.5" />
  </Svg>
);

export const IconRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M25 16a9 9 0 1 1-3-6.7" />
    <path d="M23 4v6h-6" />
  </Svg>
);

export const IconUnlock = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="14" width="18" height="14" rx="1.5" />
    <path d="M11 14V9a5 5 0 0 1 9.5-2.2M16 20v3" />
  </Svg>
);

export const IconSwap = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="5" width="22" height="22" rx="2" />
    <path d="M10 13h12l-3-3M22 19H10l3 3" />
  </Svg>
);

export const IconLogout = (p: P) => (
  <Svg {...p}>
    <path d="M20 8.5A10 10 0 1 0 20 23.5" />
    <path d="M13 16h15M24 12l4 4-4 4" />
  </Svg>
);

export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M4 15 16 5l12 10M8 12v14h6v-7h4v7h6V12" />
  </Svg>
);

export const IconMegaphone = (p: P) => (
  <Svg {...p}>
    <path d="M5 13v6h4l12 6V7L9 13z" />
    <path d="M9 19l2 7" />
  </Svg>
);

export const IconGear = (p: P) => (
  <Svg {...p}>
    <circle cx="16" cy="16" r="4" />
    <path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8" />
  </Svg>
);

export const IconRecall = (p: P) => (
  <Svg {...p}>
    <path d="M26 13A10.5 10.5 0 0 0 7 9M6 19a10.5 10.5 0 0 0 19 4" />
    <path d="M7 3.5V9h5.5M25 28.5V23h-5.5" />
    <path d="M16 10.5l1.6 4 4 1.5-4 1.5-1.6 4-1.6-4-4-1.5 4-1.5z" />
  </Svg>
);

export const IconQuickServe = (p: P) => (
  <Svg {...p}>
    <path d="M9 21a9 9 0 0 1 18 0M7 21h22M18 9.5V12M16.5 9h3" />
    <circle cx="20.5" cy="20.5" r="5.5" fill="#fff" />
    <path d="M20.5 17.5v3l2 1.5M2 14h6M3 18h4M4 22h3" />
  </Svg>
);

export const IconCashierIn = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6" width="17" height="12" rx="1" />
    <path d="M7 10h9v5H7zM3 22h17v4H3zM11 18v4M30 12h-7M26 8.5 22.5 12l3.5 3.5" />
  </Svg>
);

export const IconCashierOut = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6" width="17" height="12" rx="1" />
    <path d="M7 10h9v5H7zM3 22h17v4H3zM11 18v4M22 12h7M25.5 8.5 29 12l-3.5 3.5" />
  </Svg>
);

export const IconTip = (p: P) => (
  <Svg {...p}>
    <path d="M3 12l5-5 7 4h5a1.5 1.5 0 0 1 0 3h-6" />
    <path d="M3 12l6 8" />
    <circle cx="22" cy="20" r="7" />
    <path d="M24 17.5c-.5-.7-1.2-1-2-1-1.2 0-2 .6-2 1.5 0 2 4 1.1 4 3.1 0 .9-.9 1.5-2 1.5-.9 0-1.7-.4-2-1M22 15v1.5M22 23.5V25" />
  </Svg>
);

export const IconGift = (p: P) => (
  <svg width={p.size ?? 32} height={p.size ?? 32} viewBox="0 0 32 32" fill="none" stroke={p.color ?? '#222'} strokeWidth={p.stroke ?? 2}>
    <rect x="3" y="5" width="26" height="22" rx="3" />
    <path d="M3 11 9 5" />
    <text x="16" y="21" textAnchor="middle" fontSize="9" fontWeight="bold" fill={p.color ?? '#222'} stroke="none" fontFamily="Arial">
      Gift
    </text>
  </svg>
);

export const IconDrawer = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="10" width="26" height="12" rx="2" />
    <path d="M13 15h6M5 22v3M27 22v3" />
  </Svg>
);

export const IconSearchPerson = (p: P) => (
  <Svg {...p}>
    <circle cx="13" cy="10" r="6" />
    <path d="M3 29c.8-7 5-10 10-10 1.5 0 3 .3 4.2.9" />
    <circle cx="23" cy="23" r="4" />
    <path d="M26 26l3 3" />
  </Svg>
);

export const IconCheckBadge = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="7" fill="#3cb64a" />
    <path d="M3.8 7.2 6 9.3l4.3-4.6" stroke="#fff" strokeWidth="1.8" fill="none" />
  </svg>
);

export const IconMinusBadge = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="7" fill="#e0353a" />
    <path d="M3.5 7h7" stroke="#fff" strokeWidth="2" />
  </svg>
);

export const IconCancelAll = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="7" width="20" height="14" rx="1" />
    <path d="M10 25h8M14 21v4M24 3l5 5M29 3l-5 5" />
  </Svg>
);

export const IconVoidLine = (p: P) => (
  <Svg {...p}>
    <path d="M4 11h16M4 17h20M4 23h12M23 4l5 5M28 4l-5 5" />
  </Svg>
);

export const IconModifierBadge = () => (
  <svg width="22" height="22" viewBox="0 0 22 22">
    <rect x="1" y="1" width="20" height="20" rx="3" fill="#f6f6f6" stroke="#aab" />
    <rect x="4" y="9" width="9" height="7" fill="#9ccf6b" />
    <rect x="13" y="6" width="5" height="4" fill="#e6a23c" />
    <rect x="13" y="11" width="5" height="4" fill="#5aa0e6" />
  </svg>
);

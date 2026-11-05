import type { ReactNode } from "react";

const icons = {
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 6-3 6-3 8h18c0-2-3-2-3-8M10 20h4" />,
  delivery: <>
    <path d="M2 6h12v11H2zM14 10h4l3 3v4h-7" />
    <circle cx="6" cy="18" r="2" fill="var(--notice-icon-background, var(--color-surface))" />
    <circle cx="17" cy="18" r="2" fill="var(--notice-icon-background, var(--color-surface))" />
  </>,
  payment: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6m-6 4h6m-6 4h3" />,
  plan: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16m-12 5h3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  attention: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5m0 3h.01" /></>,
} satisfies Record<string, ReactNode>;

export function NotificationIcon({ name, size = 20 }: { name: keyof typeof icons; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {icons[name]}
  </svg>;
}

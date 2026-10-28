'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { initials } from '@rideflow/shared';
import { NotificationBell } from '@/features/notifications/notification-bell';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  /** Shown in the mobile tab bar. Everything else lives in the sidebar or account page. */
  primary?: boolean;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Ride', icon: <IconCar />, primary: true },
  { href: '/rides/shared', label: 'Shared', icon: <IconShare /> },
  { href: '/food', label: 'Food', icon: <IconFood />, primary: true },
  { href: '/parcel', label: 'Parcel', icon: <IconParcel />, primary: true },
  { href: '/orders', label: 'Orders', icon: <IconOrders />, primary: true },
  { href: '/history', label: 'History', icon: <IconHistory /> },
  { href: '/payments', label: 'Payments', icon: <IconWallet /> },
  { href: '/promotions', label: 'Promotions', icon: <IconTag /> },
  { href: '/safety', label: 'Safety', icon: <IconShield /> },
  { href: '/support', label: 'Support', icon: <IconHelp /> },
  { href: '/profile', label: 'Profile', icon: <IconUser />, primary: true },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The signed-in frame.
 *
 * Mobile gets a five-item tab bar at the bottom, within thumb reach; everything
 * else is reachable from the profile page. Desktop gets the full navigation in a
 * persistent sidebar. The two share one source of truth, so a route can never
 * appear in one and be forgotten in the other.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const primary = NAV.filter((item) => item.primary);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop navigation */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-ink-200 bg-white lg:flex xl:w-64">
        <div className="px-5 py-5">
          <Link href="/" className="inline-flex items-center gap-2">
            <Logo />
            <span className="text-lg font-semibold tracking-tight text-ink-900">Tugo</span>
          </Link>
        </div>

        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
          <ul className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive(pathname, item.href)
                      ? 'bg-brand-50 text-brand-800'
                      : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                  )}
                >
                  <span className="text-current">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {user && (
          <div className="border-t border-ink-200 px-3 py-3">
            <Link
              href="/profile"
              className="flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 hover:bg-ink-100"
            >
              <Avatar name={user.firstName} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink-900">
                  {user.firstName} {user.lastName ?? ''}
                </span>
                <span className="block truncate text-xs text-ink-500">{user.phone}</span>
              </span>
            </Link>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="inline-flex items-center gap-2">
            <Logo />
            <span className="font-semibold tracking-tight text-ink-900">Tugo</span>
          </Link>
          <NotificationBell />
        </header>

        {/* Desktop header */}
        <header className="sticky top-0 z-30 hidden items-center justify-end border-b border-ink-200 bg-white/95 px-6 py-3 backdrop-blur lg:flex">
          <NotificationBell />
        </header>

        <main className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</main>

        {/* Mobile tab bar */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 backdrop-blur lg:hidden"
        >
          <ul className="grid grid-cols-5 pb-safe">
            {primary.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 pt-2 text-[11px] font-medium',
                      active ? 'text-brand-700' : 'text-ink-500',
                    )}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

export function Avatar({ name, className }: { name: string | null; className?: string }) {
  return (
    <span
      className={clsx(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800',
        className,
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-brand-600" />
      <path
        d="M8 21c0-5 3.6-9 8-9s8 4 8 9"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="11" cy="21" r="2.5" fill="white" />
      <circle cx="21" cy="21" r="2.5" fill="white" />
    </svg>
  );
}

/* Icons — 20px line art, sized by the parent's font metrics. */
const ICON = 'size-5';

function IconCar() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 17h14M4 13l1.6-4.2A2 2 0 0 1 7.5 7.5h9a2 2 0 0 1 1.9 1.3L20 13v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" strokeLinejoin="round" />
      <circle cx="7.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconShare() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M3 19a5 5 0 0 1 10 0M13 19a5 5 0 0 1 8-4" strokeLinecap="round" />
    </svg>
  );
}

function IconFood() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10" strokeLinecap="round" />
      <path d="M17 3c-1.7 0-3 2-3 5s1 4 2 4v9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconParcel() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3 4 7v10l8 4 8-4V7z" strokeLinejoin="round" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 10h8M8 14h5" strokeLinecap="round" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" strokeLinecap="round" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18M16 14.5h2" strokeLinecap="round" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 11V5a1 1 0 0 1 1-1h6l8 8-7 7z" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" strokeLinejoin="round" />
      <path d="M9.5 12l1.8 1.8L15 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6" strokeLinecap="round" />
      <circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </svg>
  );
}

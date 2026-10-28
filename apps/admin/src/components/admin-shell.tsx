'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

interface NavGroup {
  label: string;
  items: Array<{ href: string; label: string }>;
}

const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ href: '/', label: 'Dashboard' }] },
  {
    label: 'People',
    items: [
      { href: '/users', label: 'Users' },
      { href: '/drivers', label: 'Drivers' },
      { href: '/vehicle-types', label: 'Vehicle types' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/rides', label: 'Rides' },
      { href: '/restaurants', label: 'Restaurants' },
      { href: '/food-orders', label: 'Food orders' },
      { href: '/parcels', label: 'Parcels' },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/payments', label: 'Payments' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/promotions', label: 'Promotions' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { href: '/support', label: 'Support' },
      { href: '/settings', label: 'Settings' },
      { href: '/audit-logs', label: 'Audit logs' },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The admin frame.
 *
 * Optimised for a desktop, where operational work actually happens: a persistent
 * sidebar and wide content. Below `lg` the sidebar becomes a drawer rather than
 * disappearing, so the console stays usable on a tablet or a phone when somebody
 * needs it away from a desk.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const nav = (
    <nav aria-label="Admin sections" className="flex flex-col gap-5 px-3 py-4">
      {NAV.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                  className={clsx(
                    'block rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors',
                    isActive(pathname, item.href)
                      ? 'bg-brand-50 text-brand-800'
                      : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-ink-50">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-ink-200 bg-white lg:flex">
        <div className="flex items-center gap-2 px-5 py-4">
          <Logo />
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-ink-900">RideFlow</p>
            <p className="text-[11px] font-medium uppercase tracking-wider text-brand-700">
              Admin
            </p>
          </div>
        </div>
        {nav}
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink-900/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative h-full w-64 overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center gap-2 px-5 py-4">
              <Logo />
              <p className="text-sm font-semibold text-ink-900">RideFlow Admin</p>
            </div>
            {nav}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-ink-200 bg-white/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="-m-1 rounded-[var(--radius-control)] p-1.5 text-ink-600 hover:bg-ink-100 lg:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>

          <div className="ml-auto flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-ink-600 sm:inline">
                {user.firstName} {user.lastName ?? ''}
              </span>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium text-ink-600 ring-1 ring-inset ring-ink-300 hover:bg-ink-100"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-brand-600" />
      <path d="M8 21c0-5 3.6-9 8-9s8 4 8 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="11" cy="21" r="2.5" fill="white" />
      <circle cx="21" cy="21" r="2.5" fill="white" />
    </svg>
  );
}

/** Standard page frame: title, optional description, optional actions. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-ink-900">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

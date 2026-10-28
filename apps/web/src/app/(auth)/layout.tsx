import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-linear-to-b from-brand-700 to-brand-900">
      <header className="px-5 pt-10 pb-6 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-2 text-white">
          <Logo />
          <span className="text-lg font-semibold tracking-tight">RideFlow</span>
        </Link>
        <p className="mt-3 max-w-md text-sm text-brand-100">
          Rides, shared rides, food and parcels — across the north.
        </p>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-10 sm:items-center">
        <div className="w-full max-w-md rounded-[var(--radius-card)] bg-white p-5 shadow-xl sm:p-7">
          {children}
        </div>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="white" fillOpacity="0.15" />
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

'use client';

import clsx from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';
import { statusTone, type StatusTone } from '@rideflow/shared';
import { Spinner } from './button';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-[var(--radius-card)] border border-ink-200 bg-white shadow-xs',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-ink-200 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const TONES: Record<StatusTone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  progress: 'bg-brand-50 text-brand-700 ring-brand-200',
  success: 'bg-positive-50 text-positive-700 ring-positive-500/20',
  warning: 'bg-caution-50 text-caution-700 ring-caution-500/25',
  danger: 'bg-critical-50 text-critical-700 ring-critical-500/20',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Badge whose colour is derived from a backend status, so it is never chosen by hand. */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={statusTone(status)}>{label ?? status.replace(/_/g, ' ').toLowerCase()}</Badge>;
}

/** Marks anything shared, consistently, wherever it appears. */
export function SharedBadge({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full bg-share-100 px-2.5 py-0.5',
        'text-xs font-semibold text-share-700 ring-1 ring-inset ring-share-200',
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-3" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="5" r="2.5" />
        <circle cx="11" cy="5" r="2.5" />
        <path d="M1 14a4 4 0 0 1 8 0zM7.5 14a4 4 0 0 1 7.5-2 4 4 0 0 0-3 2z" />
      </svg>
      Shared ride
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton rounded-md', className)} aria-hidden="true" />;
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-500" role="status">
      <Spinner className="size-4" />
      {label}…
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-ink-300">{icon}</div>}
      <p className="text-base font-medium text-ink-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Failure display.
 *
 * Shows the message the backend wrote, never a stack trace. The reference is
 * included so a user reporting a problem can quote something that correlates
 * with the server log.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  reference,
  onRetry,
}: {
  title?: string;
  message: string;
  reference?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center px-6 py-10 text-center"
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-critical-50 text-critical-700">
        <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 4a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1zm0 8.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
        </svg>
      </div>
      <p className="text-base font-medium text-ink-800">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{message}</p>
      {reference && <p className="mt-2 font-mono text-xs text-ink-400">Ref {reference}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 h-10 rounded-[var(--radius-control)] bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function InlineNotice({
  tone = 'progress',
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  return (
    <div className={clsx('rounded-[var(--radius-control)] px-3 py-2 text-sm ring-1 ring-inset', TONES[tone])}>
      {children}
    </div>
  );
}

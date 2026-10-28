'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ApiError, relativeTime } from '@rideflow/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingBlock,
  StatusBadge,
} from '@/components/ui/surfaces';
import { useApi } from '@/lib/api-context';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'Being looked at',
  WAITING_ON_USER: 'Waiting for you',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export default function TicketsPage() {
  const api = useApi();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['support', 'tickets'],
    queryFn: ({ signal }) => api.support.list({ limit: 30 }, { signal }),
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Your tickets</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Anything you have asked us to look into.
          </p>
        </div>
        <Link href="/support/new">
          <Button variant="primary" size="sm">New ticket</Button>
        </Link>
      </header>

      {isLoading ? (
        <LoadingBlock label="Loading your tickets" />
      ) : error ? (
        <ErrorState
          message={
            error instanceof ApiError ? error.message : 'We could not load your tickets.'
          }
          onRetry={() => void refetch()}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No tickets yet"
          description="If something goes wrong with a ride, an order or a payment, raise a ticket and we will look into it."
          action={
            <Link href="/support/new">
              <Button variant="primary">Raise a ticket</Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-100">
            {data.items.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/support/tickets/${ticket.id}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{ticket.subject}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      <StatusBadge
                        status={ticket.status}
                        label={STATUS_LABEL[ticket.status] ?? ticket.status}
                      />
                      <span>{ticket.reference}</span>
                      <span>·</span>
                      <span>{relativeTime(ticket.updatedAt ?? ticket.createdAt)}</span>
                    </p>
                  </div>
                  {/* A ticket parked on the customer is the one thing they can act on. */}
                  {ticket.status === 'WAITING_ON_USER' ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Needs you
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

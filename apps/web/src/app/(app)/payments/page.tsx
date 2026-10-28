'use client';

import { SERVICE_LABEL, dateTime, messageFor, money } from '@rideflow/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineNotice,
  Skeleton,
  StatusBadge,
} from '@/components/ui/surfaces';
import { useApi } from '@/lib/api-context';

export default function PaymentsPage() {
  const api = useApi();

  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: ({ signal }) => api.account.wallet({ limit: 10 }, { signal }),
  });

  const payments = useInfiniteQuery({
    queryKey: ['payments'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.account.payments({ cursor: pageParam, limit: 15 }, { signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = payments.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-ink-900">Payments</h1>
        <p className="mt-0.5 text-sm text-ink-500">Your wallet and everything you have paid.</p>
      </header>

      <Card className="mb-5 overflow-hidden">
        <div className="bg-linear-to-br from-brand-700 to-brand-900 p-5 text-white">
          <p className="text-sm text-brand-100">Wallet balance</p>
          {wallet.isLoading ? (
            <Skeleton className="mt-1 h-9 w-40 bg-white/20" />
          ) : (
            <p className="mt-1 text-3xl font-semibold">
              {money(wallet.data?.balance ?? '0.00', wallet.data?.currency)}
            </p>
          )}
          {wallet.data?.frozen && (
            <p className="mt-2 text-sm text-caution-50">
              Your wallet is frozen. Contact support to restore it.
            </p>
          )}
        </div>

        <div className="p-4">
          <InlineNotice tone="neutral">
            Topping up is not available yet. Your balance grows from refunds, and can be spent on
            food and parcels.
          </InlineNotice>
        </div>

        {wallet.data?.transactions && wallet.data.transactions.items.length > 0 && (
          <>
            <CardHeader title="Recent wallet activity" />
            <ul className="divide-y divide-ink-100">
              {wallet.data.transactions.items.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {entry.description ?? entry.reference ?? 'Wallet movement'}
                    </p>
                    <p className="text-xs text-ink-500">{dateTime(entry.at)}</p>
                  </div>
                  <p
                    className={
                      entry.type === 'CREDIT'
                        ? 'shrink-0 font-medium text-positive-700'
                        : 'shrink-0 font-medium text-ink-900'
                    }
                  >
                    {entry.type === 'CREDIT' ? '+' : '−'} {money(entry.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <h2 className="mb-3 text-base font-semibold text-ink-900">Payment history</h2>

      {payments.isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : payments.error ? (
        <ErrorState message={messageFor(payments.error)} onRetry={() => void payments.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No payments yet" description="Anything you pay for shows up here." />
      ) : (
        <div className="flex flex-col gap-2">
          <Card>
            <ul className="divide-y divide-ink-100">
              {rows.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">
                        {SERVICE_LABEL[payment.serviceType]}
                      </span>
                      <StatusBadge status={payment.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {payment.reference ?? '—'}
                      {payment.description && ` · ${payment.description}`}
                      {' · '}
                      {dateTime(payment.paidAt ?? payment.createdAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium text-ink-900">
                      {money(payment.amount, payment.currency)}
                    </p>
                    <p className="text-xs text-ink-500">{payment.method.toLowerCase()}</p>
                    {Number(payment.refunded) > 0 && (
                      <p className="text-xs text-positive-700">
                        {money(payment.refunded, payment.currency)} refunded
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {payments.hasNextPage && (
            <Button
              variant="secondary"
              fullWidth
              loading={payments.isFetchingNextPage}
              onClick={() => void payments.fetchNextPage()}
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import {
  FOOD_PROGRESS_STEPS,
  FOOD_STATUS_LABEL,
  dateTime,
  messageFor,
  money,
} from '@rideflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  ErrorState,
  InlineNotice,
  LoadingBlock,
  StatusBadge,
} from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { RatingDialog } from '@/features/rides/rating-dialog';
import { useApi } from '@/lib/api-context';

const LIVE = new Set([
  'PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP',
  'ASSIGNED', 'PICKED_UP', 'DELIVERING',
]);

export default function FoodOrderPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(false);

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ['food-order', id],
    queryFn: ({ signal }) => api.food.order(id, { signal }),
    // Polled only while something can still change.
    refetchInterval: (q) => (q.state.data && LIVE.has(q.state.data.status) ? 15_000 : false),
  });

  const cancel = useMutation({
    mutationFn: () => api.food.cancelOrder(id, 'Cancelled from the app'),
    onSuccess: () => {
      toast.success('Order cancelled.');
      void queryClient.invalidateQueries({ queryKey: ['food-order', id] });
    },
    onError: (caught) => toast.error(messageFor(caught)),
  });

  if (isLoading) return <LoadingBlock label="Loading your order" />;
  if (error || !order) {
    return <ErrorState message={messageFor(error)} onRetry={() => void refetch()} />;
  }

  const cancellable = ['PLACED', 'ACCEPTED'].includes(order.status);
  const delivered = order.status === 'DELIVERED';
  const failed = ['CANCELLED', 'REJECTED'].includes(order.status);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} label={FOOD_STATUS_LABEL[order.status]} />
          {LIVE.has(order.status) && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
              <span className="size-1.5 animate-pulse rounded-full bg-positive-500" aria-hidden="true" />
              updating
            </span>
          )}
        </div>
        <h1 className="mt-2 text-xl font-semibold text-ink-900">{order.restaurant.name}</h1>
        <p className="text-sm text-ink-500">Order {order.reference}</p>
      </header>

      {failed && (
        <div className="mb-4">
          <InlineNotice tone="danger">
            {order.rejectionReason ?? order.cancellationReason ?? 'This order did not go ahead.'}
          </InlineNotice>
        </div>
      )}

      {!failed && (
        <Card className="mb-4">
          <CardHeader
            title="Progress"
            description={
              order.estimatedPrepMinutes
                ? `About ${order.estimatedPrepMinutes} minutes to prepare`
                : undefined
            }
          />
          <ol className="flex flex-col p-4">
            {FOOD_PROGRESS_STEPS.map((step, index) => {
              const reached = order.progress.some((p) => p.status === step);
              const current = order.status === step;
              const entry = order.progress.find((p) => p.status === step);
              const last = index === FOOD_PROGRESS_STEPS.length - 1;

              return (
                <li key={step} className="flex gap-3">
                  <div className="flex flex-col items-center" aria-hidden="true">
                    <span
                      className={clsx(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
                        reached ? 'bg-brand-600 text-white' : 'bg-ink-200',
                      )}
                    >
                      {reached && (
                        <svg viewBox="0 0 20 20" className="size-3" fill="currentColor">
                          <path d="M8 13.2 4.8 10l-1.3 1.3L8 15.8l8.5-8.5-1.3-1.3z" />
                        </svg>
                      )}
                    </span>
                    {!last && (
                      <span
                        className={clsx('my-0.5 w-px flex-1', reached ? 'bg-brand-300' : 'bg-ink-200')}
                      />
                    )}
                  </div>

                  <div className={clsx('pb-4', last && 'pb-0')}>
                    <p
                      className={clsx(
                        'text-sm',
                        current
                          ? 'font-semibold text-ink-900'
                          : reached
                            ? 'font-medium text-ink-700'
                            : 'text-ink-400',
                      )}
                    >
                      {FOOD_STATUS_LABEL[step]}
                    </p>
                    {entry && <p className="text-xs text-ink-500">{dateTime(entry.at)}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {order.courier && (
        <Card className="mb-4">
          <CardHeader title="Your courier" />
          <div className="flex items-center gap-3 p-4">
            <Avatar name={order.courier.firstName} className="size-11" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-900">{order.courier.firstName}</p>
              <p className="text-sm text-ink-500">
                ★ {order.courier.rating}
                {order.courier.vehicle &&
                  ` · ${order.courier.vehicle.colour} ${order.courier.vehicle.make}`}
              </p>
            </div>
            {order.courier.phone && (
              <a
                href={`tel:${order.courier.phone}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
                aria-label={`Call ${order.courier.firstName}`}
              >
                <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
                  <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h1A1.5 1.5 0 0 1 7 3.5v2A1.5 1.5 0 0 1 5.5 7H5a9 9 0 0 0 8 8v-.5A1.5 1.5 0 0 1 14.5 13h2a1.5 1.5 0 0 1 1.5 1.5v1a2.5 2.5 0 0 1-2.5 2.5A13.5 13.5 0 0 1 2 4.5z" />
                </svg>
              </a>
            )}
          </div>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader title="Your order" description={order.delivery.address} />
        <ul className="divide-y divide-ink-100">
          {order.items.map((item, index) => (
            <li key={index} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm text-ink-900">
                  <span className="font-medium">{item.quantity}×</span> {item.name}
                </p>
                {item.notes && <p className="text-xs text-ink-500">{item.notes}</p>}
              </div>
              <p className="shrink-0 text-sm text-ink-700">
                {money(item.lineTotal, order.charge.currency)}
              </p>
            </li>
          ))}
        </ul>

        {/* Every line here is the backend's arithmetic, shown verbatim. */}
        <dl className="flex flex-col gap-1.5 border-t border-ink-200 p-4 text-sm">
          <Row label="Items" value={money(order.charge.itemsSubtotal, order.charge.currency)} />
          <Row label="Delivery" value={money(order.charge.deliveryFee, order.charge.currency)} />
          {Number(order.charge.serviceFee) > 0 && (
            <Row label="Service fee" value={money(order.charge.serviceFee, order.charge.currency)} />
          )}
          {Number(order.charge.tax) > 0 && (
            <Row label="Tax" value={money(order.charge.tax, order.charge.currency)} />
          )}
          {Number(order.charge.discount) > 0 && (
            <Row
              label="Discount"
              value={`− ${money(order.charge.discount, order.charge.currency)}`}
              tone="positive"
            />
          )}
          <div className="mt-1 flex items-center justify-between border-t border-ink-200 pt-2">
            <dt className="font-semibold text-ink-900">Total</dt>
            <dd className="text-lg font-semibold text-ink-900">
              {money(order.charge.total, order.charge.currency)}
            </dd>
          </div>
          {order.payment && (
            <p className="text-xs text-ink-500">
              {order.payment.method === 'CASH' ? 'Cash on delivery' : order.payment.method} ·{' '}
              {order.payment.status.toLowerCase()}
            </p>
          )}
        </dl>
      </Card>

      <div className="flex flex-col gap-2">
        {delivered && (
          <Button fullWidth onClick={() => setRating(true)}>
            Rate this order
          </Button>
        )}
        {cancellable && (
          <Button
            variant="secondary"
            fullWidth
            loading={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Cancel order
          </Button>
        )}
      </div>

      <RatingDialog
        open={rating}
        onClose={() => setRating(false)}
        title="How was your order?"
        onSubmit={(score, comment) => api.ratings.rateFoodOrder(id, { score, comment })}
      />
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive';
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-600">{label}</dt>
      <dd className={tone === 'positive' ? 'text-positive-700' : 'text-ink-800'}>{value}</dd>
    </div>
  );
}

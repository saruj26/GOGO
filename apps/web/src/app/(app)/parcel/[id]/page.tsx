'use client';

import {
  PARCEL_PROGRESS_STEPS,
  PARCEL_STATUS_LABEL,
  dateTime,
  distance,
  messageFor,
  money,
  phone as formatPhone,
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
  'PLACED', 'SEARCHING_DRIVER', 'ASSIGNED', 'HEADING_TO_PICKUP', 'PICKED_UP', 'IN_TRANSIT',
]);

export default function ParcelTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(false);

  const { data: parcel, isLoading, error, refetch } = useQuery({
    queryKey: ['parcel', id],
    queryFn: ({ signal }) => api.parcels.get(id, { signal }),
    refetchInterval: (q) => (q.state.data && LIVE.has(q.state.data.status) ? 15_000 : false),
  });

  const { data: tracking } = useQuery({
    queryKey: ['parcel-tracking', id],
    queryFn: ({ signal }) => api.parcels.tracking(id, { limit: 50 }, { signal }),
    refetchInterval: (q) => (parcel && LIVE.has(parcel.status) ? 15_000 : false),
    enabled: Boolean(parcel),
  });

  const cancel = useMutation({
    mutationFn: () => api.parcels.cancel(id, 'Cancelled from the app'),
    onSuccess: () => {
      toast.success('Parcel cancelled.');
      void queryClient.invalidateQueries({ queryKey: ['parcel', id] });
    },
    onError: (caught) => toast.error(messageFor(caught)),
  });

  if (isLoading) return <LoadingBlock label="Loading your parcel" />;
  if (error || !parcel) {
    return <ErrorState message={messageFor(error)} onRetry={() => void refetch()} />;
  }

  const cancellable = ['PLACED', 'SEARCHING_DRIVER', 'ASSIGNED', 'HEADING_TO_PICKUP'].includes(
    parcel.status,
  );
  const delivered = parcel.status === 'DELIVERED';

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6">
      <header className="mb-4">
        <StatusBadge status={parcel.status} label={PARCEL_STATUS_LABEL[parcel.status]} />
        <h1 className="mt-2 text-xl font-semibold text-ink-900">Parcel {parcel.reference}</h1>
        <p className="text-sm text-ink-500">
          {parcel.parcelType.name}
          {parcel.weightKg && ` · ${parcel.weightKg} kg`}
          {parcel.route.distanceM && ` · ${distance(parcel.route.distanceM)}`}
        </p>
      </header>

      {parcel.status === 'FAILED' && parcel.cancellationReason && (
        <div className="mb-4">
          <InlineNotice tone="danger">{parcel.cancellationReason}</InlineNotice>
        </div>
      )}

      <Card className="mb-4">
        <CardHeader title="Journey" />
        <div className="flex gap-3 p-4">
          <div className="flex flex-col items-center pt-1" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-brand-600" />
            <span className="my-1 w-px flex-1 bg-ink-300" />
            <span className="size-2.5 rounded-full bg-ink-900" />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <p className="text-sm font-medium text-ink-900">{parcel.pickup.address}</p>
              <p className="text-xs text-ink-500">
                {parcel.pickup.contactName} · {formatPhone(parcel.pickup.contactPhone)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-ink-900">{parcel.dropoff.address}</p>
              <p className="text-xs text-ink-500">
                {parcel.dropoff.receiverName} · {formatPhone(parcel.dropoff.receiverPhone)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {parcel.courier && (
        <Card className="mb-4">
          <CardHeader title="Your courier" />
          <div className="flex items-center gap-3 p-4">
            <Avatar name={parcel.courier.firstName} className="size-11" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-900">{parcel.courier.firstName}</p>
              <p className="text-sm text-ink-500">★ {parcel.courier.rating}</p>
            </div>
            {parcel.courier.phone && (
              <a
                href={`tel:${parcel.courier.phone}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
                aria-label={`Call ${parcel.courier.firstName}`}
              >
                <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
                  <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h1A1.5 1.5 0 0 1 7 3.5v2A1.5 1.5 0 0 1 5.5 7H5a9 9 0 0 0 8 8v-.5A1.5 1.5 0 0 1 14.5 13h2a1.5 1.5 0 0 1 1.5 1.5v1a2.5 2.5 0 0 1-2.5 2.5A13.5 13.5 0 0 1 2 4.5z" />
                </svg>
              </a>
            )}
          </div>
        </Card>
      )}

      {/* Tracking is the API's record of what happened, not a simulation. */}
      <Card className="mb-4">
        <CardHeader title="Tracking" description={`Reference ${parcel.reference}`} />
        <div className="p-4">
          <ol className="flex flex-col">
            {PARCEL_PROGRESS_STEPS.map((step, index) => {
              const entry = tracking?.items.find((t) => t.status === step);
              const reached = Boolean(entry);
              const current = parcel.status === step;
              const last = index === PARCEL_PROGRESS_STEPS.length - 1;

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
                      <span className={clsx('my-0.5 w-px flex-1', reached ? 'bg-brand-300' : 'bg-ink-200')} />
                    )}
                  </div>
                  <div className={clsx('pb-4', last && 'pb-0')}>
                    <p
                      className={clsx(
                        'text-sm',
                        current ? 'font-semibold text-ink-900' : reached ? 'font-medium text-ink-700' : 'text-ink-400',
                      )}
                    >
                      {PARCEL_STATUS_LABEL[step]}
                    </p>
                    {entry && (
                      <>
                        <p className="text-xs text-ink-500">{dateTime(entry.createdAt)}</p>
                        {entry.note && <p className="text-xs text-ink-500">{entry.note}</p>}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </Card>

      {parcel.payment && (
        <Card className="mb-4">
          <CardHeader title="Payment" />
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-xl font-semibold text-ink-900">
                {money(parcel.payment.amount, parcel.payment.currency)}
              </p>
              <p className="text-sm text-ink-500">
                {parcel.payment.method === 'CASH' ? 'Cash' : parcel.payment.method} ·{' '}
                {parcel.payment.status.toLowerCase()}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {delivered && (
          <Button fullWidth onClick={() => setRating(true)}>
            Rate this delivery
          </Button>
        )}
        {cancellable && (
          <Button
            variant="secondary"
            fullWidth
            loading={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Cancel parcel
          </Button>
        )}
      </div>

      <RatingDialog
        open={rating}
        onClose={() => setRating(false)}
        title="How was the delivery?"
        onSubmit={(score, comment) => api.ratings.rateParcel(id, { score, comment })}
      />
    </div>
  );
}

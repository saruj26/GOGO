'use client';

import {
  RIDE_STATUS_LABEL,
  distance,
  duration,
  messageFor,
  money,
  phone as formatPhone,
  time,
} from '@rideflow/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Avatar } from '@/components/app-shell';
import { MapView, type MapMarker } from '@/components/map/lazy-map';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
  Card,
  CardHeader,
  ErrorState,
  InlineNotice,
  LoadingBlock,
  SharedBadge,
  StatusBadge,
} from '@/components/ui/surfaces';
import { useToast } from '@/components/ui/toast';
import { RatingDialog } from '@/features/rides/rating-dialog';
import { useRideTracking } from '@/features/rides/use-ride-tracking';
import { useApi } from '@/lib/api-context';

export default function RideTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { ride, isLoading, error, refetch, isLive } = useRideTracking(id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rating, setRating] = useState(false);

  const cancel = useMutation({
    mutationFn: () => api.rides.cancel(id, 'Cancelled from the app'),
    onSuccess: () => {
      toast.success('Your ride has been cancelled.');
      setConfirmCancel(false);
      void queryClient.invalidateQueries({ queryKey: ['rides'] });
    },
    onError: (caught) => toast.error(messageFor(caught)),
  });

  const markers = useMemo<MapMarker[]>(() => {
    if (!ride?.myLeg) return [];
    return [
      { id: 'pickup', position: ride.myLeg.pickup, kind: 'pickup', label: 'Pickup' },
      { id: 'dropoff', position: ride.myLeg.dropoff, kind: 'dropoff', label: 'Destination' },
    ];
  }, [ride]);

  if (isLoading) return <LoadingBlock label="Loading your ride" />;

  if (error || !ride) {
    return (
      <ErrorState
        title="We could not load this ride"
        message={messageFor(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  const shared = ride.rideType === 'SHARED';
  const cancellable = ['SEARCHING', 'SCHEDULED', 'ACCEPTED', 'DRIVER_ARRIVING'].includes(ride.status);
  const finished = ride.status === 'COMPLETED';

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)] lg:flex-row-reverse">
      <div className="h-[34dvh] min-h-52 shrink-0 lg:h-full lg:flex-1">
        <MapView
          className="size-full"
          markers={markers}
          routePolyline={ride.route?.encodedPolyline}
        />
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto lg:w-[26rem] lg:shrink-0 lg:flex-none lg:border-r lg:border-ink-200 xl:w-[30rem]">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {shared ? <SharedBadge /> : <span className="text-sm font-medium text-ink-500">Solo ride</span>}
            <StatusBadge status={ride.status} label={RIDE_STATUS_LABEL[ride.status]} />
            {isLive && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                <span className="size-1.5 animate-pulse rounded-full bg-positive-500" aria-hidden="true" />
                updating
              </span>
            )}
          </div>

          <div>
            <h1 className="text-lg font-semibold text-ink-900">Ride {ride.reference}</h1>
            {ride.scheduledPickupAt && (
              <p className="mt-0.5 text-sm text-ink-500">
                Scheduled for {time(ride.scheduledPickupAt)}
              </p>
            )}
          </div>

          {/* Journey */}
          {ride.myLeg && (
            <Card className="p-4">
              <div className="flex gap-3">
                <div className="flex flex-col items-center pt-1" aria-hidden="true">
                  <span className="size-2.5 rounded-full bg-brand-600" />
                  <span className="my-1 w-px flex-1 bg-ink-300" />
                  <span className="size-2.5 rounded-full bg-ink-900" />
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <div>
                    <p className="text-sm font-medium text-ink-900">{ride.myLeg.pickup.address}</p>
                    {ride.myLeg.estimatedPickupAt && (
                      <p className="text-xs text-ink-500">
                        Pickup around {time(ride.myLeg.estimatedPickupAt)}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-900">{ride.myLeg.dropoff.address}</p>
                    {ride.myLeg.estimatedDropoffAt && (
                      <p className="text-xs text-ink-500">
                        Arriving around {time(ride.myLeg.estimatedDropoffAt)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {ride.route && (
                <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">
                  {distance(ride.route.distanceM)} · {duration(ride.route.durationS)}
                </p>
              )}
            </Card>
          )}

          {/* Driver */}
          {ride.driver ? (
            <Card>
              <CardHeader title="Your driver" />
              <div className="flex items-center gap-3 p-4">
                <Avatar name={ride.driver.firstName} className="size-12" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{ride.driver.firstName}</p>
                  <p className="text-sm text-ink-500">
                    ★ {ride.driver.rating} · {ride.driver.trips} trips
                  </p>
                  {ride.vehicle && (
                    <p className="mt-1 text-sm text-ink-600">
                      {ride.vehicle.colour} {ride.vehicle.make} {ride.vehicle.model}
                      {' · '}
                      <span className="font-mono font-medium text-ink-900">
                        {ride.vehicle.plateNumber}
                      </span>
                    </p>
                  )}
                </div>
                {ride.driver.phone && (
                  <a
                    href={`tel:${ride.driver.phone}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
                    aria-label={`Call ${ride.driver.firstName}`}
                  >
                    <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
                      <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h1A1.5 1.5 0 0 1 7 3.5v2A1.5 1.5 0 0 1 5.5 7H5a9 9 0 0 0 8 8v-.5A1.5 1.5 0 0 1 14.5 13h2a1.5 1.5 0 0 1 1.5 1.5v1a2.5 2.5 0 0 1-2.5 2.5A13.5 13.5 0 0 1 2 4.5z" />
                    </svg>
                  </a>
                )}
              </div>
              {!ride.driver.phone && (
                <p className="px-4 pb-4 text-xs text-ink-500">
                  The driver&apos;s number becomes available once they are on the way.
                </p>
              )}
            </Card>
          ) : (
            <InlineNotice tone="warning">
              We are finding you a driver. This usually takes a couple of minutes.
            </InlineNotice>
          )}

          {shared && ride.coPassengerCount > 0 && (
            <InlineNotice tone="progress">
              {ride.coPassengerCount} other {ride.coPassengerCount === 1 ? 'passenger is' : 'passengers are'}{' '}
              sharing this ride. Your fare already reflects the saving.
            </InlineNotice>
          )}

          {/* Fare */}
          {ride.myLeg?.fare && (
            <Card>
              <CardHeader title="Fare" />
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-2xl font-semibold text-ink-900">
                    {money(ride.myLeg.fare.total, ride.myLeg.fare.currency)}
                  </p>
                  {ride.myLeg.payment && (
                    <p className="mt-0.5 text-sm text-ink-500">
                      {ride.myLeg.payment.method === 'CASH' ? 'Pay the driver in cash' : ride.myLeg.payment.method}
                      {' · '}
                      {ride.myLeg.payment.status.toLowerCase()}
                    </p>
                  )}
                </div>
                {ride.myLeg.fare.isShared && <SharedBadge />}
              </div>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            {finished && (
              <Button variant="primary" fullWidth onClick={() => setRating(true)}>
                Rate your ride
              </Button>
            )}

            {cancellable && (
              <Button variant="secondary" fullWidth onClick={() => setConfirmCancel(true)}>
                Cancel ride
              </Button>
            )}

            <Button variant="ghost" fullWidth onClick={() => router.push('/history')}>
              Back to history
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this ride?"
        description="A cancellation fee may apply depending on how far along the driver is."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setConfirmCancel(false)}>
              Keep the ride
            </Button>
            <Button
              variant="danger"
              fullWidth
              loading={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              Cancel ride
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-600">
          {shared
            ? 'You will be removed from this shared ride. The journey continues for the other passengers.'
            : 'Your driver will be released to take another booking.'}
        </p>
      </Modal>

      <RatingDialog
        open={rating}
        onClose={() => setRating(false)}
        title="How was your ride?"
        onSubmit={(score, comment) => api.ratings.rateRide(id, { score, comment })}
      />
    </div>
  );
}

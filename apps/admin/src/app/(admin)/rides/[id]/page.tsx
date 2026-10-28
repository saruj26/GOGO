'use client';

import { RIDE_STATUS_LABEL, dateTime, distance, duration, messageFor, money, type RideStatus } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/admin-shell';
import {
  Badge,
  Card,
  CardHeader,
  ErrorState,
  InlineNotice,
  LoadingBlock,
  SharedBadge,
  StatusBadge,
} from '@/components/ui/surfaces';
import { useAdminApi } from '@/lib/admin-context';

export default function AdminRidePage() {
  const { id } = useParams<{ id: string }>();
  const admin = useAdminApi();

  const { data: ride, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'ride', id],
    queryFn: ({ signal }) => admin.ride(id, { signal }),
  });

  if (isLoading) return <LoadingBlock label="Loading the ride" />;
  if (error || !ride) {
    return <ErrorState message={messageFor(error)} onRetry={() => void refetch()} />;
  }

  const rejections = Object.entries(ride.matching.rejectionsByReason);

  return (
    <>
      <PageHeader
        title={`Ride ${ride.reference}`}
        description={dateTime(ride.createdAt)}
        actions={
          <Link href="/rides">
            <span className="inline-flex h-9 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium text-ink-600 ring-1 ring-inset ring-ink-300 hover:bg-ink-100">
              All rides
            </span>
          </Link>
        }
      />

      <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card>
            <CardHeader title="Summary" />
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
              <Detail label="Status">
                <StatusBadge status={ride.status} label={RIDE_STATUS_LABEL[ride.status as RideStatus]} />
              </Detail>
              <Detail label="Type">
                {ride.rideType === 'SHARED' ? <SharedBadge /> : <span className="text-sm">Solo</span>}
              </Detail>
              <Detail label="Vehicle class">
                <span className="text-sm text-ink-900">{ride.vehicleType}</span>
              </Detail>
              <Detail label="Seats">
                <span className="text-sm tabular-nums text-ink-900">
                  {ride.seats.occupied} of {ride.seats.total}
                  {ride.seats.joinable && <span className="ml-1.5 text-xs text-share-700">open to joins</span>}
                </span>
              </Detail>
              <Detail label="Distance">
                <span className="text-sm text-ink-900">{distance(ride.distanceM)}</span>
              </Detail>
              <Detail label="Duration">
                <span className="text-sm text-ink-900">{duration(ride.durationS)}</span>
              </Detail>
            </div>

            {ride.cancellationReason && (
              <div className="px-4 pb-4">
                <InlineNotice tone="danger">
                  Cancelled by {ride.cancelledBy?.toLowerCase() ?? 'unknown'}: {ride.cancellationReason}
                </InlineNotice>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Passengers"
              description={`${ride.passengers.length} on this ride`}
            />
            <ul className="divide-y divide-ink-100">
              {ride.passengers.map((passenger) => (
                <li key={passenger.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink-900">{passenger.firstName}</p>
                        <StatusBadge status={passenger.status} />
                        {passenger.joinedExistingRoute && (
                          <Badge tone="warning">joined existing route</Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm text-ink-600">{passenger.from}</p>
                      <p className="truncate text-sm text-ink-500">→ {passenger.to}</p>
                      <p className="mt-1 text-xs text-ink-400">{passenger.phone}</p>
                    </div>

                    {passenger.money && (
                      <dl className="shrink-0 text-right text-sm">
                        <div>
                          <dt className="text-xs text-ink-500">Passenger paid</dt>
                          <dd className="font-semibold tabular-nums text-ink-900">
                            {money(passenger.money.passengerPaid, passenger.money.currency)}
                          </dd>
                        </div>
                        <div className="mt-1.5">
                          <dt className="text-xs text-ink-500">Driver earned</dt>
                          <dd className="tabular-nums text-ink-700">
                            {money(passenger.money.driverEarned, passenger.money.currency)}
                          </dd>
                        </div>
                        <div className="mt-1.5">
                          <dt className="text-xs text-ink-500">Commission</dt>
                          <dd className="tabular-nums text-positive-700">
                            {money(passenger.money.platformCommission, passenger.money.currency)}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Stop plan" description="In the order the driver serves them" />
            <ol className="divide-y divide-ink-100">
              {ride.stops.map((stop) => (
                <li key={`${stop.sequence}-${stop.type}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                    {stop.sequence + 1}
                  </span>
                  <Badge tone={stop.type === 'PICKUP' ? 'progress' : 'neutral'}>
                    {stop.type.toLowerCase()}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{stop.address}</span>
                  <StatusBadge status={stop.status} />
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {ride.driver && (
            <Card>
              <CardHeader title="Driver" />
              <div className="p-4">
                <p className="font-medium text-ink-900">{ride.driver.name}</p>
                <p className="text-sm text-ink-500">{ride.driver.phone}</p>
                <p className="mt-1 text-sm text-ink-600">★ {ride.driver.rating}</p>
                {ride.vehicle && (
                  <p className="mt-2 text-sm text-ink-600">
                    {ride.vehicle.colour} {ride.vehicle.make} {ride.vehicle.model}
                    <br />
                    <span className="font-mono text-xs">{ride.vehicle.plateNumber}</span>
                  </p>
                )}
                <Link
                  href="/drivers"
                  className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
                >
                  Manage driver
                </Link>
              </div>
            </Card>
          )}

          {/*
            Matching is summarised rather than itemised. Operations needs to know
            why a ride was or was not offered; the per-candidate scores are
            internal and are deliberately not surfaced.
          */}
          {ride.rideType === 'SHARED' && (
            <Card>
              <CardHeader title="Shared matching" />
              <div className="p-4">
                <div className="flex gap-6">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-ink-900">
                      {ride.matching.candidatesEvaluated}
                    </p>
                    <p className="text-xs text-ink-500">evaluated</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-positive-700">
                      {ride.matching.offered}
                    </p>
                    <p className="text-xs text-ink-500">offered</p>
                  </div>
                </div>

                {rejections.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Not offered because
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {rejections
                        .sort((a, b) => b[1] - a[1])
                        .map(([reason, count]) => (
                          <li key={reason} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate text-ink-700">
                              {reason.toLowerCase().replace(/_/g, ' ')}
                            </span>
                            <span className="shrink-0 tabular-nums text-ink-500">{count}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Timeline" />
            <ol className="divide-y divide-ink-100">
              {ride.statusHistory.map((entry, index) => (
                <li key={index} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge
                      status={entry.toStatus}
                      label={RIDE_STATUS_LABEL[entry.toStatus as RideStatus]}
                    />
                    <span className="shrink-0 text-xs text-ink-500">{dateTime(entry.createdAt)}</span>
                  </div>
                  {(entry.reason || entry.actorRole) && (
                    <p className="mt-1 text-xs text-ink-500">
                      {entry.actorRole?.toLowerCase()}
                      {entry.reason && ` · ${entry.reason}`}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs text-ink-500">{label}</p>
      {children}
    </div>
  );
}

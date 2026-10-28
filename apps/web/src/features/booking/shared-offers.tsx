'use client';

import { amount, distance, money, time, type SharedRideOffer } from '@rideflow/shared';
import clsx from 'clsx';
import { Avatar } from '@/components/app-shell';
import { SharedBadge, Skeleton } from '@/components/ui/surfaces';

interface SharedOffersProps {
  offers: SharedRideOffer[] | undefined;
  loading: boolean;
  noMatchReason: string | null | undefined;
  selectedRideId: string | null;
  onSelect: (offer: SharedRideOffer) => void;
  pickupLabel: string;
  dropoffLabel: string;
}

/**
 * Shared rides the backend has decided this journey can join.
 *
 * Every number shown — fare, saving, walking distance, arrival time, seats — is
 * the backend's. The application performs no compatibility check of its own and
 * would have no way to: route geometry, direction, detour, timing, capacity and
 * safety are all decided by the matching engine.
 */
export function SharedOffers({
  offers,
  loading,
  noMatchReason,
  selectedRideId,
  onSelect,
  pickupLabel,
  dropoffLabel,
}: SharedOffersProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[132px] w-full" />
        <Skeleton className="h-[132px] w-full" />
      </div>
    );
  }

  if (!offers || offers.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-4 py-6 text-center">
        <SharedBadge className="mb-3" />
        <p className="text-sm font-medium text-ink-800">No shared ride on your route yet</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-500">
          {noMatchReason ?? 'No driver is currently travelling your way.'}
        </p>
        <p className="mt-3 text-xs text-ink-400">
          You can book a solo ride instead, or try again in a few minutes.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {offers.map((offer) => {
        const selected = offer.rideId === selectedRideId;

        return (
          <li key={offer.rideId}>
            <button
              type="button"
              onClick={() => onSelect(offer)}
              aria-pressed={selected}
              className={clsx(
                'w-full rounded-[var(--radius-card)] border bg-white p-4 text-left transition-colors',
                selected
                  ? 'border-share-500 ring-1 ring-share-500'
                  : 'border-ink-200 hover:border-share-400',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <SharedBadge />
                {Number(offer.saving) > 0 && (
                  <span className="rounded-full bg-positive-50 px-2.5 py-0.5 text-xs font-semibold text-positive-700">
                    Save {amount(offer.saving)}
                  </span>
                )}
              </div>

              {/* The journey, laid out as a route rather than two fields. */}
              <div className="mt-3 flex gap-3">
                <div className="flex flex-col items-center pt-1" aria-hidden="true">
                  <span className="size-2.5 rounded-full bg-brand-600" />
                  <span className="my-1 w-px flex-1 bg-ink-300" />
                  <span className="size-2.5 rounded-full bg-ink-900" />
                </div>

                <div className="min-w-0 flex-1">
                  <div>
                    <p className="truncate text-sm font-medium text-ink-900">{pickupLabel}</p>
                    <p className="text-xs text-ink-500">
                      {time(offer.estimatedPickupAt)} · {distance(offer.pickupWalkMeters)} walk
                    </p>
                  </div>
                  <div className="mt-3">
                    <p className="truncate text-sm font-medium text-ink-900">{dropoffLabel}</p>
                    <p className="text-xs text-ink-500">
                      {time(offer.estimatedDropoffAt)} · {distance(offer.dropoffWalkMeters)} walk
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-3 border-t border-ink-100 pt-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {offer.driver && <Avatar name={offer.driver.firstName} className="size-8" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {offer.driver?.firstName ?? 'Driver'}
                      {offer.vehicle && (
                        <span className="font-normal text-ink-500">
                          {' · '}
                          {offer.vehicle.colour} {offer.vehicle.make}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-500">
                      {offer.driver && <>★ {offer.driver.rating} · </>}
                      {offer.coPassengerCount === 0
                        ? 'no one else aboard yet'
                        : `${offer.coPassengerCount} other ${offer.coPassengerCount === 1 ? 'passenger' : 'passengers'}`}
                      {' · '}
                      {offer.seatsAvailable} {offer.seatsAvailable === 1 ? 'seat' : 'seats'} free
                    </p>
                  </div>
                </div>

                <p className="shrink-0 text-right text-lg font-semibold text-ink-900">
                  {money(offer.fare.total, offer.fare.currency)}
                </p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

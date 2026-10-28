'use client';

import {
  messageFor,
  money,
  type Place,
  type SharedRideGenderPreference,
  type SharedRideOffer,
  type VehicleEstimate,
} from '@rideflow/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MapView, type MapMarker } from '@/components/map/lazy-map';
import { Button } from '@/components/ui/button';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Card, InlineNotice, SharedBadge } from '@/components/ui/surfaces';
import { LocationSearch } from '@/features/booking/location-search';
import { SharedOffers } from '@/features/booking/shared-offers';
import { VehicleOptions } from '@/features/booking/vehicle-options';
import { useApi } from '@/lib/api-context';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';

type Mode = 'SOLO' | 'SHARED';

export default function BookRidePage() {
  const api = useApi();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();

  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [mode, setMode] = useState<Mode>('SOLO');
  const [vehicle, setVehicle] = useState<VehicleEstimate | null>(null);
  const [offer, setOffer] = useState<SharedRideOffer | null>(null);
  const [note, setNote] = useState('');
  const [promotionCode, setPromotionCode] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [genderPreference, setGenderPreference] = useState<SharedRideGenderPreference>('ANY');
  const [error, setError] = useState<string | null>(null);
  const [pinTarget, setPinTarget] = useState<'pickup' | 'dropoff' | null>(null);

  const ready = Boolean(pickup && dropoff);

  const { data: savedPlaces } = useQuery({
    queryKey: ['places', 'saved'],
    queryFn: ({ signal }) => api.places.saved({ signal }),
  });

  // --- fare and ETA, per vehicle class, from the backend ------------------
  const {
    data: estimates,
    isFetching: estimating,
    error: estimateError,
  } = useQuery({
    queryKey: ['rides', 'estimate', pickup, dropoff, scheduledFor],
    queryFn: ({ signal }) =>
      api.rides.estimate(
        {
          pickup: pickup as Place,
          dropoff: dropoff as Place,
          scheduledPickupAt: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        },
        { signal },
      ),
    enabled: ready,
  });

  // --- shared candidates, decided entirely by the matching engine ---------
  const {
    data: sharedResult,
    isFetching: searchingShared,
    refetch: refetchShared,
  } = useQuery({
    queryKey: ['rides', 'shared', pickup, dropoff, genderPreference, vehicle?.vehicleTypeId, scheduledFor],
    queryFn: ({ signal }) =>
      api.rides.searchShared(
        {
          pickup: pickup as Place,
          dropoff: dropoff as Place,
          vehicleTypeId: vehicle?.vehicleTypeId,
          genderPreference,
          scheduledPickupAt: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        },
        { signal },
      ),
    enabled: ready && mode === 'SHARED',
    // Offers expire; do not serve a stale one from cache.
    staleTime: 0,
  });

  const joinShared = useMutation({
    mutationFn: ({ requestId, rideId }: { requestId: string; rideId: string }) =>
      api.rides.joinShared({ requestId, rideId, note: note.trim() || undefined }),
    onSuccess: (result) => {
      toast.success('You are on the ride. We will let you know when the driver is close.');
      router.push(`/rides/${result.rideId}`);
    },
    onError: (caught) => setError(messageFor(caught)),
  });

  const bookSolo = useMutation({
    mutationFn: () =>
      api.rides.create({
        rideType: mode === 'SHARED' ? 'SHARED' : 'SOLO',
        vehicleTypeId: (vehicle as VehicleEstimate).vehicleTypeId,
        pickup: pickup as Place,
        dropoff: dropoff as Place,
        note: note.trim() || undefined,
        promotionCode: promotionCode.trim() || undefined,
        genderPreference: mode === 'SHARED' ? genderPreference : undefined,
        scheduledPickupAt: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      }),
    onSuccess: (ride) => {
      toast.success(scheduledFor ? 'Your ride is scheduled.' : 'Looking for a driver…');
      router.push(`/rides/${ride.rideId}`);
    },
    onError: (caught) => setError(messageFor(caught)),
  });

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (pickup) list.push({ id: 'pickup', position: pickup, kind: 'pickup', label: 'Pickup' });
    if (dropoff) list.push({ id: 'dropoff', position: dropoff, kind: 'dropoff', label: 'Destination' });
    return list;
  }, [pickup, dropoff]);

  async function onMapClick(position: { lat: number; lng: number }) {
    if (!pinTarget) return;

    const target = pinTarget;
    setPinTarget(null);

    try {
      const place = await api.places.reverse(position);
      const chosen: Place = { lat: place.lat, lng: place.lng, address: place.address };
      if (target === 'pickup') setPickup(chosen);
      else setDropoff(chosen);
    } catch {
      const fallback: Place = {
        ...position,
        address: `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`,
      };
      if (target === 'pickup') setPickup(fallback);
      else setDropoff(fallback);
    }
  }

  const canBook =
    mode === 'SHARED'
      ? Boolean(offer && sharedResult?.requestId)
      : Boolean(vehicle && ready);

  const submitting = bookSolo.isPending || joinShared.isPending;

  function onConfirm() {
    setError(null);

    if (mode === 'SHARED' && offer && sharedResult) {
      joinShared.mutate({ requestId: sharedResult.requestId, rideId: offer.rideId });
      return;
    }

    bookSolo.mutate();
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:h-[calc(100dvh-3.5rem)] lg:flex-row-reverse">
      {/* Map — the top half on mobile, the right side on desktop. */}
      <div className="relative h-[38dvh] min-h-56 shrink-0 lg:h-full lg:flex-1">
        <MapView
          className="size-full"
          markers={markers}
          center={pickup ?? undefined}
          onMapClick={onMapClick}
        />

        {pinTarget && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-4">
            <p className="rounded-full bg-ink-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
              Tap the map to set your {pinTarget === 'pickup' ? 'pickup' : 'destination'}
            </p>
          </div>
        )}
      </div>

      {/* Booking panel */}
      <div className="relative z-10 -mt-4 flex min-w-0 flex-1 flex-col rounded-t-[var(--radius-card)] bg-ink-50 lg:mt-0 lg:w-[26rem] lg:shrink-0 lg:overflow-y-auto lg:rounded-none lg:border-r lg:border-ink-200 xl:w-[30rem]">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div>
            <h1 className="text-lg font-semibold text-ink-900">
              {user ? `Where to, ${user.firstName}?` : 'Where to?'}
            </h1>
            <p className="mt-0.5 text-sm text-ink-500">
              Book a ride, or share one that is already going your way.
            </p>
          </div>

          <Card className="flex flex-col gap-3 p-3 sm:p-4">
            <LocationSearch
              label="Pickup"
              placeholder="Where should we collect you?"
              value={pickup}
              onChange={setPickup}
              near={pickup ?? dropoff}
              savedPlaces={savedPlaces}
              showCurrentLocation
              tone="pickup"
            />

            <LocationSearch
              label="Destination"
              placeholder="Where are you going?"
              value={dropoff}
              onChange={setDropoff}
              near={pickup ?? dropoff}
              savedPlaces={savedPlaces}
              tone="dropoff"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPinTarget(pinTarget === 'pickup' ? null : 'pickup')}
                className={clsx(
                  'rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors',
                  pinTarget === 'pickup'
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-white text-ink-600 ring-ink-300 hover:bg-ink-50',
                )}
              >
                Pin pickup on map
              </button>
              <button
                type="button"
                onClick={() => setPinTarget(pinTarget === 'dropoff' ? null : 'dropoff')}
                className={clsx(
                  'rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors',
                  pinTarget === 'dropoff'
                    ? 'bg-ink-900 text-white ring-ink-900'
                    : 'bg-white text-ink-600 ring-ink-300 hover:bg-ink-50',
                )}
              >
                Pin destination on map
              </button>
            </div>
          </Card>

          {!ready && (
            <p className="px-1 text-sm text-ink-500">
              Choose both points to see fares and shared rides.
            </p>
          )}

          {ready && (
            <>
              {/* Solo or shared — the product's central choice, given equal weight. */}
              <div
                role="radiogroup"
                aria-label="Ride type"
                className="grid grid-cols-2 gap-2 rounded-[var(--radius-control)] bg-ink-200/60 p-1"
              >
                <ModeTab
                  active={mode === 'SOLO'}
                  onClick={() => {
                    setMode('SOLO');
                    setOffer(null);
                  }}
                  title="Solo ride"
                  subtitle="Just you"
                />
                <ModeTab
                  active={mode === 'SHARED'}
                  onClick={() => {
                    setMode('SHARED');
                    setVehicle(null);
                  }}
                  title="Shared ride"
                  subtitle="Pay less"
                  accent
                />
              </div>

              {estimateError && (
                <InlineNotice tone="danger">{messageFor(estimateError)}</InlineNotice>
              )}

              {mode === 'SOLO' ? (
                <section aria-label="Vehicle options" className="flex flex-col gap-3">
                  <h2 className="px-1 text-sm font-semibold text-ink-700">Choose a vehicle</h2>
                  <VehicleOptions
                    options={estimates}
                    loading={estimating}
                    selectedId={vehicle?.vehicleTypeId ?? null}
                    onSelect={setVehicle}
                    mode="SOLO"
                  />
                </section>
              ) : (
                <section aria-label="Shared rides" className="flex flex-col gap-3">
                  <Card className="flex flex-col gap-3 p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <SharedBadge />
                      <button
                        type="button"
                        onClick={() => void refetchShared()}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        Refresh
                      </button>
                    </div>

                    <SelectField
                      label="Who are you happy to share with?"
                      hint="Applied as a strict rule — we will never place you with someone outside it."
                      value={genderPreference}
                      onChange={(e) => {
                        setGenderPreference(e.target.value as SharedRideGenderPreference);
                        setOffer(null);
                      }}
                    >
                      <option value="ANY">Anyone</option>
                      <option value="SAME_GENDER_ONLY">Same gender only</option>
                      <option value="WOMEN_ONLY">Women only</option>
                      <option value="MEN_ONLY">Men only</option>
                    </SelectField>
                  </Card>

                  <SharedOffers
                    offers={sharedResult?.offers}
                    loading={searchingShared}
                    noMatchReason={sharedResult?.noMatchReason}
                    selectedRideId={offer?.rideId ?? null}
                    onSelect={setOffer}
                    pickupLabel={pickup?.address ?? ''}
                    dropoffLabel={dropoff?.address ?? ''}
                  />

                  {sharedResult && sharedResult.offers.length === 0 && (
                    <Button variant="secondary" fullWidth onClick={() => setMode('SOLO')}>
                      Book a solo ride instead
                    </Button>
                  )}
                </section>
              )}

              {/* Everything that applies to either kind of booking. */}
              <Card className="flex flex-col gap-3 p-3 sm:p-4">
                <h2 className="text-sm font-semibold text-ink-700">Booking details</h2>

                <TextField
                  label="Schedule for later"
                  type="datetime-local"
                  hint="Leave empty to book now."
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />

                <TextAreaField
                  label="Note for the driver"
                  placeholder="Blue gate, second floor…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                />

                {mode === 'SOLO' && (
                  <TextField
                    label="Promotion code"
                    placeholder="Optional"
                    value={promotionCode}
                    onChange={(e) => setPromotionCode(e.target.value.toUpperCase())}
                    autoCapitalize="characters"
                  />
                )}

                <div className="rounded-[var(--radius-control)] bg-ink-100 px-3 py-2.5 text-sm text-ink-600">
                  Payment: <span className="font-medium text-ink-900">Cash</span>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Card and online payment are not available yet. Wallet can be used for food and
                    parcels.
                  </p>
                </div>
              </Card>

              {error && <InlineNotice tone="danger">{error}</InlineNotice>}
            </>
          )}
        </div>

        {/* Sticky confirm bar — always reachable without scrolling back. */}
        {ready && (
          <div className="sticky bottom-0 mt-auto border-t border-ink-200 bg-white/95 px-4 py-3 pb-safe backdrop-blur sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-ink-500">
                  {mode === 'SHARED' ? 'Shared fare' : 'Estimated fare'}
                </p>
                <p className="truncate text-lg font-semibold text-ink-900">
                  {mode === 'SHARED'
                    ? offer
                      ? money(offer.fare.total, offer.fare.currency)
                      : '—'
                    : vehicle
                      ? money(vehicle.soloFare, vehicle.currency)
                      : '—'}
                </p>
              </div>

              <Button
                size="lg"
                variant={mode === 'SHARED' ? 'share' : 'primary'}
                disabled={!canBook}
                loading={submitting}
                onClick={onConfirm}
                className="min-w-36"
              >
                {scheduledFor ? 'Schedule' : mode === 'SHARED' ? 'Join ride' : 'Book now'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  title,
  subtitle,
  accent = false,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-center transition-colors',
        active
          ? accent
            ? 'bg-share-500 text-ink-900 shadow-sm'
            : 'bg-white text-ink-900 shadow-sm'
          : 'text-ink-600 hover:text-ink-900',
      )}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-xs opacity-80">{subtitle}</span>
    </button>
  );
}

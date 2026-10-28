'use client';

import { amount, distance, duration, type VehicleEstimate } from '@rideflow/shared';
import clsx from 'clsx';
import { Skeleton } from '@/components/ui/surfaces';

interface VehicleOptionsProps {
  options: VehicleEstimate[] | undefined;
  loading: boolean;
  selectedId: string | null;
  onSelect: (option: VehicleEstimate) => void;
  /** In shared mode only classes the backend marks shareable can be chosen. */
  mode: 'SOLO' | 'SHARED';
}

/**
 * The vehicle picker.
 *
 * Every class, its capacity, its fare and whether it can be shared come from the
 * backend. Nothing about "bike", "auto", "car" or "van" is written into this
 * component — adding a class in the admin console makes it appear here.
 */
export function VehicleOptions({
  options,
  loading,
  selectedId,
  onSelect,
  mode,
}: VehicleOptionsProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px] w-full" />
        ))}
      </div>
    );
  }

  if (!options || options.length === 0) return null;

  const shareable = mode === 'SHARED' ? options.filter((o) => o.sharedRideEligible) : options;

  if (shareable.length === 0) {
    return (
      <p className="rounded-[var(--radius-control)] bg-caution-50 px-3 py-2.5 text-sm text-caution-700">
        No vehicle class currently offers shared rides. Switch to a solo ride to continue.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Vehicle type">
      {shareable.map((option) => {
        const selected = option.vehicleTypeId === selectedId;
        const price = mode === 'SHARED' ? (option.sharedFareFrom ?? option.soloFare) : option.soloFare;

        return (
          <li key={option.vehicleTypeId}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(option)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-[var(--radius-control)] border p-3 text-left transition-colors',
                selected
                  ? mode === 'SHARED'
                    ? 'border-share-500 bg-share-50 ring-1 ring-share-500'
                    : 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                  : 'border-ink-200 bg-white hover:border-ink-300',
              )}
            >
              <VehicleIcon code={option.code} />

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-ink-900">{option.name}</span>
                  <span className="text-xs text-ink-500">
                    {option.maxPassengers} {option.maxPassengers === 1 ? 'seat' : 'seats'}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  {duration(option.durationS)} · {distance(option.distanceM)}
                </span>
              </span>

              <span className="shrink-0 text-right">
                <span className="block font-semibold text-ink-900">{amount(price)}</span>
                {mode === 'SHARED' && option.sharedSaving && (
                  <span className="block text-xs font-medium text-share-700">
                    save {amount(option.sharedSaving)}
                  </span>
                )}
                {mode === 'SOLO' && !option.sharedRideEligible && (
                  <span className="block text-[11px] text-ink-400">solo only</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A pictogram per vehicle class, chosen by code with a generic fallback.
 *
 * This is presentation only — an unrecognised class still renders and remains
 * fully bookable, so the backend can add one without a frontend release.
 */
function VehicleIcon({ code }: { code: string }) {
  const shared = 'size-6 text-ink-700';

  if (code === 'BIKE') {
    return (
      <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="5.5" cy="17" r="3" />
        <circle cx="18.5" cy="17" r="3" />
        <path d="M5.5 17l4-8h4l3 8M9 9h5M14 6h2.5l1.5 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (code === 'AUTO') {
    return (
      <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M4 17V12a6 6 0 0 1 6-6h3l4 6v5" strokeLinejoin="round" />
        <path d="M4 17h16" strokeLinecap="round" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
    );
  }

  if (code === 'MINI_VAN') {
    return (
      <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M3 16V9a2 2 0 0 1 2-2h12l4 5v4" strokeLinejoin="round" />
        <path d="M3 16h18M9 7v5M3 12h18" strokeLinecap="round" />
        <circle cx="7.5" cy="17.5" r="2" />
        <circle cx="17" cy="17.5" r="2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={shared} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 13l1.6-4.2A2 2 0 0 1 7.5 7.5h9a2 2 0 0 1 1.9 1.3L20 13v4h-2.5M4 17v-4M6.5 17H17.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="7" cy="17" r="1.8" />
      <circle cx="17" cy="17" r="1.8" />
    </svg>
  );
}

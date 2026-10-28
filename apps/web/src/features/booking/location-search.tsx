'use client';

import { messageFor, type Place } from '@rideflow/shared';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/button';
import { useDebounced } from '@/hooks/use-debounced';
import { useCurrentPosition } from '@/hooks/use-current-position';
import { useApi } from '@/lib/api-context';

interface LocationSearchProps {
  label: string;
  placeholder: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  /** Biases results toward the user, when we know where they are. */
  near?: { lat: number; lng: number } | null;
  savedPlaces?: Array<{ id: string; label: string; address: string; lat: number; lng: number }>;
  showCurrentLocation?: boolean;
  tone?: 'pickup' | 'dropoff';
  autoFocus?: boolean;
}

/**
 * Address entry.
 *
 * Typing is debounced and every superseded request is cancelled, so a fast
 * typist produces one lookup rather than a dozen. Saved places and "use my
 * location" are offered before any typing happens, because that is what most
 * bookings actually use.
 */
export function LocationSearch({
  label,
  placeholder,
  value,
  onChange,
  near,
  savedPlaces = [],
  showCurrentLocation = false,
  tone = 'pickup',
  autoFocus = false,
}: LocationSearchProps) {
  const api = useApi();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(query, 350);
  const containerRef = useRef<HTMLDivElement>(null);
  const { locate, loading: locating, error: locationError } = useCurrentPosition();

  const {
    data,
    isFetching,
    error: searchError,
  } = useQuery({
    queryKey: ['places', 'search', debounced, near?.lat, near?.lng],
    queryFn: ({ signal }) =>
      api.places.search(debounced, near ?? undefined, { signal }),
    enabled: open && debounced.trim().length >= 3,
    staleTime: 5 * 60_000,
  });

  // Close when focus or a click leaves the control.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function select(place: Place) {
    onChange(place);
    setQuery('');
    setOpen(false);
  }

  async function useMyLocation() {
    const position = await locate();
    if (!position) return;

    try {
      const place = await api.places.reverse(position);
      select({ lat: place.lat, lng: place.lng, address: place.address });
    } catch {
      // Reverse lookup is a nicety; the coordinates are what the booking needs.
      select({
        ...position,
        address: `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`,
      });
    }
  }

  const results = data?.results ?? [];
  const showSuggestions = open && (results.length > 0 || savedPlaces.length > 0 || isFetching);

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-ink-700">{label}</label>

      <div
        className={clsx(
          'flex items-center gap-2.5 rounded-[var(--radius-control)] border bg-white px-3',
          'transition-colors focus-within:border-brand-500',
          open ? 'border-brand-400' : 'border-ink-300',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'size-2.5 shrink-0 rounded-full',
            tone === 'pickup' ? 'bg-brand-600' : 'bg-ink-900',
          )}
        />

        <input
          type="text"
          autoFocus={autoFocus}
          className="h-11 min-w-0 flex-1 bg-transparent text-ink-900 placeholder:text-ink-400 focus:outline-none"
          placeholder={placeholder}
          value={open ? query : (value?.address ?? '')}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          role="combobox"
          aria-controls={`${label}-results`}
        />

        {isFetching && <Spinner className="size-4 text-ink-400" />}

        {value && !open && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="-mr-1 rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94z" />
            </svg>
          </button>
        )}
      </div>

      {showSuggestions && (
        <div
          id={`${label}-results`}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-[var(--radius-card)] border border-ink-200 bg-white py-1 shadow-lg"
        >
          {showCurrentLocation && query.length === 0 && (
            <button
              type="button"
              onClick={useMyLocation}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-ink-50"
            >
              {locating ? (
                <Spinner className="size-4 text-brand-600" />
              ) : (
                <svg viewBox="0 0 20 20" className="size-4 text-brand-600" fill="currentColor" aria-hidden="true">
                  <path d="M10 2a1 1 0 0 1 1 1v1.06A6 6 0 0 1 15.94 9H17a1 1 0 1 1 0 2h-1.06A6 6 0 0 1 11 15.94V17a1 1 0 1 1-2 0v-1.06A6 6 0 0 1 4.06 11H3a1 1 0 1 1 0-2h1.06A6 6 0 0 1 9 4.06V3a1 1 0 0 1 1-1zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
                </svg>
              )}
              <span className="font-medium text-brand-700">Use my current location</span>
            </button>
          )}

          {query.length === 0 &&
            savedPlaces.map((place) => (
              <button
                key={place.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => select({ lat: place.lat, lng: place.lng, address: place.address })}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-ink-50"
              >
                <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-ink-400" fill="currentColor" aria-hidden="true">
                  <path d="M10 2 3 6v10a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1V6z" />
                </svg>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">{place.label}</span>
                  <span className="block truncate text-xs text-ink-500">{place.address}</span>
                </span>
              </button>
            ))}

          {results.map((place, index) => (
            <button
              key={`${place.lat}-${place.lng}-${index}`}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => select(place)}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-ink-50"
            >
              <svg viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-ink-400" fill="currentColor" aria-hidden="true">
                <path d="M10 2a5.5 5.5 0 0 0-5.5 5.5c0 4 5.5 10.5 5.5 10.5s5.5-6.5 5.5-10.5A5.5 5.5 0 0 0 10 2zm0 7.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
              </svg>
              <span className="min-w-0 text-sm text-ink-800">{place.address}</span>
            </button>
          ))}

          {debounced.trim().length >= 3 && !isFetching && results.length === 0 && !searchError && (
            <p className="px-3 py-4 text-center text-sm text-ink-500">
              Nothing found. Try a different search, or drop a pin on the map.
            </p>
          )}

          {searchError && (
            <p className="px-3 py-4 text-center text-sm text-critical-700">
              {messageFor(searchError)}
            </p>
          )}

          {locationError && (
            <p className="px-3 py-2 text-xs text-caution-700">{locationError}</p>
          )}

          {data?.attribution && (
            <p className="border-t border-ink-100 px-3 py-2 text-[11px] text-ink-400">
              {data.attribution}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

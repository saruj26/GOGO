'use client';

import type { LatLng } from '@rideflow/shared';
import { useCallback, useState } from 'react';

interface PositionState {
  position: LatLng | null;
  loading: boolean;
  error: string | null;
}

/**
 * The browser's geolocation, asked for only when the user asks for it.
 *
 * Permission is never requested on page load — a booking screen that demands
 * location before showing anything is hostile, and a denied prompt is hard to
 * undo.
 */
export function useCurrentPosition() {
  const [state, setState] = useState<PositionState>({
    position: null,
    loading: false,
    error: null,
  });

  const locate = useCallback((): Promise<LatLng | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        position: null,
        loading: false,
        error: 'This browser cannot share your location. Enter an address instead.',
      });
      return Promise.resolve(null);
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (result) => {
          const position = { lat: result.coords.latitude, lng: result.coords.longitude };
          setState({ position, loading: false, error: null });
          resolve(position);
        },
        (error) => {
          const message =
            error.code === error.PERMISSION_DENIED
              ? 'Location access was declined. Enter an address instead.'
              : 'We could not work out where you are. Enter an address instead.';
          setState({ position: null, loading: false, error: message });
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    });
  }, []);

  return { ...state, locate };
}

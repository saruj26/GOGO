'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/surfaces';

/**
 * The map, split out of the initial bundle.
 *
 * MapLibre is roughly 300 kB — more than the rest of a booking screen combined.
 * Loading it after first paint means the form is interactive immediately and the
 * map arrives a moment later, which is the order people actually use them in.
 * `ssr: false` because MapLibre needs a real DOM.
 */
export const MapView = dynamic(
  () => import('./map-view').then((module) => module.MapView),
  {
    ssr: false,
    loading: () => <Skeleton className="size-full rounded-none" />,
  },
);

export type { MapMarker } from './map-view';

'use client';

import { boundsOf, decodePolyline, type LatLng } from '@rideflow/shared';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

export interface MapMarker {
  id: string;
  position: LatLng;
  kind: 'pickup' | 'dropoff' | 'vehicle' | 'stop' | 'place';
  label?: string;
}

interface MapViewProps {
  center?: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  /** Encoded polyline from the API. Decoded here; never recomputed. */
  routePolyline?: string | null;
  /** Fits the viewport to the route and markers whenever they change. */
  fitToContent?: boolean;
  onMapClick?: (position: LatLng) => void;
  className?: string;
  interactive?: boolean;
}

const DEFAULT_CENTER: LatLng = { lat: 9.6615, lng: 80.0255 };

/**
 * The map.
 *
 * Rendered with MapLibre over OpenStreetMap raster tiles, which need no API key.
 * The tile source is the only thing here tied to a vendor — swapping to a
 * commercial style is a change to `TILE_STYLE` and nothing else.
 *
 * The map instance is created once and mutated imperatively. Re-creating it on
 * every render, or driving it through React state, would make panning stutter on
 * exactly the screens where smoothness matters most.
 */
const TILE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const MARKER_STYLE: Record<MapMarker['kind'], { colour: string; ring: string }> = {
  pickup: { colour: 'var(--color-brand-600)', ring: 'white' },
  dropoff: { colour: 'var(--color-ink-900)', ring: 'white' },
  vehicle: { colour: 'var(--color-share-500)', ring: 'white' },
  stop: { colour: 'var(--color-share-600)', ring: 'white' },
  place: { colour: 'var(--color-critical-500)', ring: 'white' },
};

export function MapView({
  center,
  zoom = 13,
  markers = [],
  routePolyline,
  fitToContent = true,
  onMapClick,
  className,
  interactive = true,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const clickHandlerRef = useRef(onMapClick);
  clickHandlerRef.current = onMapClick;

  // --- create once -------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TILE_STYLE,
      center: [center?.lng ?? DEFAULT_CENTER.lng, center?.lat ?? DEFAULT_CENTER.lat],
      zoom,
      interactive,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('click', (event) => {
      clickHandlerRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // Deliberately created once: later prop changes are applied by the effects
    // below rather than by rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- route line --------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const path = routePolyline ? decodePolyline(routePolyline) : [];

    const apply = () => {
      const source = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
      const data: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: path.map((p) => [p.lng, p.lat]) },
      };

      if (source) {
        source.setData(data);
        return;
      }

      map.addSource('route', { type: 'geojson', data });
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0f5c63', 'line-width': 4.5 },
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [routePolyline]);

  // --- markers -----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = markers.map((marker) => {
      const element = document.createElement('div');
      const style = MARKER_STYLE[marker.kind];
      element.style.cssText = `
        width: 18px; height: 18px; border-radius: 9999px;
        background: ${style.colour}; border: 3px solid ${style.ring};
        box-shadow: 0 1px 4px rgba(0,0,0,.35);
      `;
      if (marker.label) element.title = marker.label;

      return new maplibregl.Marker({ element })
        .setLngLat([marker.position.lng, marker.position.lat])
        .addTo(map);
    });
  }, [markers]);

  // --- viewport ----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitToContent) return;

    const points = [
      ...(routePolyline ? decodePolyline(routePolyline) : []),
      ...markers.map((m) => m.position),
    ];

    if (points.length === 0) {
      if (center) map.easeTo({ center: [center.lng, center.lat], zoom, duration: 500 });
      return;
    }

    if (points.length === 1) {
      map.easeTo({ center: [points[0].lng, points[0].lat], zoom: 15, duration: 500 });
      return;
    }

    const bounds = boundsOf(points);
    if (bounds) {
      map.fitBounds(bounds, {
        // Generous bottom padding: on mobile the booking sheet covers the lower
        // half of the map, and a route hidden behind it is useless.
        padding: { top: 60, right: 48, bottom: 220, left: 48 },
        maxZoom: 16,
        duration: 600,
      });
    }
  }, [routePolyline, markers, fitToContent, center, zoom]);

  return <div ref={containerRef} className={className} role="application" aria-label="Map" />;
}

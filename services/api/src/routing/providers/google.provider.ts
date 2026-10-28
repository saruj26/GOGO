import { Logger } from '@nestjs/common';
import { DomainError, DomainErrorCode } from '../../common/errors/domain.error';
import { LatLng, decodePolyline, dedupePath } from '../../common/utils/geo';
import {
  GeocodeResult,
  RouteRequest,
  RouteResult,
  RoutingProvider,
} from '../routing.types';

const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';
const REQUEST_TIMEOUT_MS = 8_000;

interface GoogleLatLng {
  latitude: number;
  longitude: number;
}

interface GoogleRoutesResponse {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
    legs?: Array<{ distanceMeters?: number; duration?: string }>;
  }>;
  error?: { message?: string; status?: string };
}

interface GoogleGeocodeResponse {
  status: string;
  results?: Array<{
    formatted_address: string;
    place_id: string;
    geometry: { location: { lat: number; lng: number } };
  }>;
}

/** `"123s"` → 123 */
function parseDuration(value: string | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value.replace(/s$/, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toGoogleWaypoint(p: LatLng) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } satisfies GoogleLatLng } };
}

/**
 * Google Maps Platform adapter, built on the Routes API (computeRoutes) and the
 * Geocoding API.
 *
 * The API key is read from configuration and only ever travels in the
 * `X-Goog-Api-Key` request header to Google — it is never logged, never
 * included in an error message and never returned to a client.
 */
export class GoogleRoutingProvider implements RoutingProvider {
  readonly name = 'google';
  private readonly logger = new Logger(GoogleRoutingProvider.name);

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error('GoogleRoutingProvider requires an API key');
    }
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    if (request.waypoints.length < 2) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'A route requires at least an origin and a destination',
      );
    }

    const [origin, ...rest] = request.waypoints;
    const destination = rest.pop() as LatLng;

    const body: Record<string, unknown> = {
      origin: toGoogleWaypoint(origin),
      destination: toGoogleWaypoint(destination),
      travelMode: 'DRIVE',
      polylineEncoding: 'ENCODED_POLYLINE',
      computeAlternativeRoutes: false,
      // Stop order is decided by our own optimiser, which must respect
      // pickup-before-dropoff per passenger. Letting Google reorder would
      // silently violate that invariant.
      optimizeWaypointOrder: false,
    };

    if (rest.length > 0) {
      body.intermediates = rest.map(toGoogleWaypoint);
    }

    if (request.departureAt && request.departureAt.getTime() > Date.now()) {
      body.departureTime = request.departureAt.toISOString();
      body.routingPreference = 'TRAFFIC_AWARE';
    } else {
      body.routingPreference = 'TRAFFIC_AWARE';
    }

    const payload = await this.post<GoogleRoutesResponse>(ROUTES_ENDPOINT, body, {
      'X-Goog-Api-Key': this.apiKey,
      'X-Goog-FieldMask':
        'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration',
    });

    const route = payload.routes?.[0];
    const encoded = route?.polyline?.encodedPolyline;
    if (!route || !encoded) {
      throw new DomainError(
        DomainErrorCode.ROUTE_NOT_COMPATIBLE,
        'No drivable route exists between the selected points',
      );
    }

    return {
      provider: this.name,
      encodedPolyline: encoded,
      path: dedupePath(decodePolyline(encoded, 5)),
      distanceM: route.distanceMeters ?? 0,
      durationS: parseDuration(route.duration),
      legs: (route.legs ?? []).map((leg) => ({
        distanceM: leg.distanceMeters ?? 0,
        durationS: parseDuration(leg.duration),
      })),
    };
  }

  async geocode(query: string, near?: LatLng): Promise<GeocodeResult[]> {
    const url = new URL(GEOCODE_ENDPOINT);
    url.searchParams.set('address', query);
    url.searchParams.set('key', this.apiKey);
    if (near) {
      // Biases, does not restrict — a nearby match simply ranks higher.
      url.searchParams.set('bounds', this.boundsAround(near));
    }

    const payload = await this.get<GoogleGeocodeResponse>(url);
    if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
      throw new DomainError(
        DomainErrorCode.ROUTING_PROVIDER_UNAVAILABLE,
        'Location search is temporarily unavailable',
      );
    }

    return (payload.results ?? []).map((r) => ({
      address: r.formatted_address,
      location: { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
      providerPlaceId: r.place_id,
    }));
  }

  async reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
    const url = new URL(GEOCODE_ENDPOINT);
    url.searchParams.set('latlng', `${point.lat},${point.lng}`);
    url.searchParams.set('key', this.apiKey);

    const payload = await this.get<GoogleGeocodeResponse>(url);
    const first = payload.results?.[0];
    if (!first) return null;

    return {
      address: first.formatted_address,
      location: { lat: first.geometry.location.lat, lng: first.geometry.location.lng },
      providerPlaceId: first.place_id,
    };
  }

  /** Roughly ±5km, used only to bias geocoding results toward the user. */
  private boundsAround(p: LatLng): string {
    const d = 0.045;
    return `${p.lat - d},${p.lng - d}|${p.lat + d},${p.lng + d}`;
  }

  private async get<T>(url: URL): Promise<T> {
    return this.request<T>(url.toString(), { method: 'GET' }, url.origin + url.pathname);
  }

  private async post<T>(
    endpoint: string,
    body: unknown,
    headers: Record<string, string>,
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      },
      endpoint,
    );
  }

  private async request<T>(url: string, init: RequestInit, safeUrl: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        // `safeUrl` deliberately excludes the query string so the API key
        // cannot reach the log.
        this.logger.error(`Google request failed: ${response.status} ${safeUrl}`);
        throw new DomainError(
          DomainErrorCode.ROUTING_PROVIDER_UNAVAILABLE,
          'The mapping service is temporarily unavailable. Please try again.',
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      this.logger.error(
        `Google request error for ${safeUrl}: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new DomainError(
        DomainErrorCode.ROUTING_PROVIDER_UNAVAILABLE,
        'The mapping service is temporarily unavailable. Please try again.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

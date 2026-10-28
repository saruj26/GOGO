import { LatLng } from '../common/utils/geo';

export interface RouteLeg {
  distanceM: number;
  durationS: number;
}

export interface RouteResult {
  provider: string;
  /** Encoded polyline at precision 5. */
  encodedPolyline: string;
  /** Decoded, de-duplicated geometry. */
  path: LatLng[];
  distanceM: number;
  durationS: number;
  /** One entry per consecutive waypoint pair. */
  legs: RouteLeg[];
}

export interface RouteRequest {
  /** Ordered stops: origin, intermediates…, destination. At least two. */
  waypoints: LatLng[];
  /** Used for traffic-aware routing when the provider supports it. */
  departureAt?: Date;
}

export interface GeocodeResult {
  address: string;
  location: LatLng;
  providerPlaceId?: string;
}

/**
 * The seam between the platform and whichever map vendor is configured.
 *
 * Nothing outside this folder may reference a vendor SDK, a vendor URL or a
 * vendor response shape — swapping providers must be a configuration change,
 * not a code change.
 */
export interface RoutingProvider {
  readonly name: string;
  route(request: RouteRequest): Promise<RouteResult>;
  geocode(query: string, near?: LatLng): Promise<GeocodeResult[]>;
  reverseGeocode(point: LatLng): Promise<GeocodeResult | null>;
}

export const ROUTING_PROVIDER = Symbol('ROUTING_PROVIDER');

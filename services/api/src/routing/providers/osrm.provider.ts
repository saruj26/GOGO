import { Logger } from '@nestjs/common';
import { DomainError, DomainErrorCode } from '../../common/errors/domain.error';
import { LatLng, decodePolyline, dedupePath, encodePolyline } from '../../common/utils/geo';
import { GeocodeResult, RouteRequest, RouteResult, RoutingProvider } from '../routing.types';

const REQUEST_TIMEOUT_MS = 8_000;

interface OsrmRouteResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: string;
    legs?: Array<{ distance: number; duration: number }>;
  }>;
}

/**
 * OSRM adapter, for self-hosted OpenStreetMap routing.
 *
 * OSRM has no geocoder, so `geocode`/`reverseGeocode` report their absence
 * explicitly rather than returning misleading empty results — a deployment
 * using OSRM must pair it with a separate geocoding service.
 */
export class OsrmRoutingProvider implements RoutingProvider {
  readonly name = 'osrm';
  private readonly logger = new Logger(OsrmRoutingProvider.name);

  constructor(private readonly baseUrl: string) {
    if (!baseUrl) {
      throw new Error('OsrmRoutingProvider requires a base URL');
    }
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    if (request.waypoints.length < 2) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'A route requires at least an origin and a destination',
      );
    }

    const coords = request.waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = new URL(`${this.baseUrl.replace(/\/$/, '')}/route/v1/driving/${coords}`);
    url.searchParams.set('overview', 'full');
    url.searchParams.set('geometries', 'polyline6');
    url.searchParams.set('steps', 'false');
    url.searchParams.set('annotations', 'false');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new DomainError(
          DomainErrorCode.ROUTING_PROVIDER_UNAVAILABLE,
          'The routing service is temporarily unavailable. Please try again.',
        );
      }

      const payload = (await response.json()) as OsrmRouteResponse;
      const route = payload.routes?.[0];
      if (payload.code !== 'Ok' || !route) {
        throw new DomainError(
          DomainErrorCode.ROUTE_NOT_COMPATIBLE,
          'No drivable route exists between the selected points',
        );
      }

      // OSRM is queried at precision 6; the platform stores precision 5 so all
      // persisted polylines are interchangeable regardless of provider.
      const path = dedupePath(decodePolyline(route.geometry, 6));

      return {
        provider: this.name,
        encodedPolyline: encodePolyline(path, 5),
        path,
        distanceM: Math.round(route.distance),
        durationS: Math.round(route.duration),
        legs: (route.legs ?? []).map((leg) => ({
          distanceM: Math.round(leg.distance),
          durationS: Math.round(leg.duration),
        })),
      };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      this.logger.error(`OSRM request failed: ${error instanceof Error ? error.name : 'unknown'}`);
      throw new DomainError(
        DomainErrorCode.ROUTING_PROVIDER_UNAVAILABLE,
        'The routing service is temporarily unavailable. Please try again.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async geocode(): Promise<GeocodeResult[]> {
    throw new DomainError(
      DomainErrorCode.ROUTING_PROVIDER_UNAVAILABLE,
      'Address search is not configured for this deployment',
    );
  }

  async reverseGeocode(_point: LatLng): Promise<GeocodeResult | null> {
    throw new DomainError(
      DomainErrorCode.ROUTING_PROVIDER_UNAVAILABLE,
      'Address lookup is not configured for this deployment',
    );
  }
}

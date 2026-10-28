import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LatLng, pathToWkt } from '../common/utils/geo';
import { PrismaService } from '../prisma/prisma.service';
import {
  GeocodeResult,
  ROUTING_PROVIDER,
  RouteRequest,
  RouteResult,
  RoutingProvider,
} from './routing.types';

interface CacheEntry {
  value: RouteResult;
  expiresAt: number;
}

/**
 * Wraps the configured provider with the concerns that are the platform's
 * rather than the vendor's: short-lived caching of identical route requests,
 * and persistence of route geometry into PostGIS.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly cache = new Map<string, CacheEntry>();

  private static readonly CACHE_TTL_MS = 60_000;
  private static readonly CACHE_MAX_ENTRIES = 500;
  /** ~11 m of precision — enough to collapse repeated quotes for one journey. */
  private static readonly CACHE_COORD_PRECISION = 4;

  constructor(
    @Inject(ROUTING_PROVIDER) private readonly provider: RoutingProvider,
    private readonly prisma: PrismaService,
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  async route(request: RouteRequest): Promise<RouteResult> {
    // Traffic-aware future departures are never cached — the whole point of
    // supplying a departure time is that the answer changes with it.
    const cacheable = !request.departureAt;
    const key = cacheable ? this.cacheKey(request.waypoints) : null;

    if (key) {
      const hit = this.cache.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        return hit.value;
      }
    }

    const result = await this.provider.route(request);

    if (key) {
      if (this.cache.size >= RoutingService.CACHE_MAX_ENTRIES) {
        const oldest = this.cache.keys().next().value;
        if (oldest) this.cache.delete(oldest);
      }
      this.cache.set(key, { value: result, expiresAt: Date.now() + RoutingService.CACHE_TTL_MS });
    }

    return result;
  }

  geocode(query: string, near?: LatLng): Promise<GeocodeResult[]> {
    return this.provider.geocode(query, near);
  }

  reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
    return this.provider.reverseGeocode(point);
  }

  /**
   * Writes a new immutable route version and makes it the ride's active route.
   *
   * Geometry has to go through raw SQL because Prisma cannot represent a
   * PostGIS type; the WKT is passed as a bound parameter, never interpolated.
   * Must be called inside the caller's transaction so the ride and its route
   * are never observed out of step.
   */
  async persistRideRoute(
    tx: Prisma.TransactionClient,
    rideId: string,
    route: RouteResult,
  ): Promise<{ routeId: string; version: number }> {
    const wkt = pathToWkt(route.path);

    const [{ next_version: nextVersion }] = await tx.$queryRaw<Array<{ next_version: number }>>`
      SELECT COALESCE(MAX(version), 0) + 1 AS next_version
      FROM ride_routes
      WHERE ride_id = ${rideId}::uuid
    `;

    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO ride_routes (
        id, ride_id, version, provider, encoded_polyline, geometry,
        distance_m, duration_s, legs, computed_at
      ) VALUES (
        gen_random_uuid(),
        ${rideId}::uuid,
        ${nextVersion},
        ${route.provider},
        ${route.encodedPolyline},
        ST_SetSRID(ST_GeomFromText(${wkt}), 4326)::geography,
        ${route.distanceM},
        ${route.durationS},
        ${JSON.stringify(route.legs)}::jsonb,
        now()
      )
      RETURNING id
    `;

    const routeId = rows[0].id;

    await tx.ride.update({
      where: { id: rideId },
      data: {
        activeRouteId: routeId,
        plannedDistanceM: route.distanceM,
        plannedDurationS: route.durationS,
      },
    });

    return { routeId, version: Number(nextVersion) };
  }

  private cacheKey(waypoints: readonly LatLng[]): string {
    const p = RoutingService.CACHE_COORD_PRECISION;
    return waypoints.map((w) => `${w.lat.toFixed(p)},${w.lng.toFixed(p)}`).join('|');
  }
}

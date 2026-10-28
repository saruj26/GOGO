import { LatLng, encodePolyline, haversineMeters } from '../../common/utils/geo';
import { GeocodeResult, RouteRequest, RouteResult, RoutingProvider } from '../routing.types';

/**
 * DEVELOPMENT AND TEST ONLY — rejected at boot when NODE_ENV=production
 * (see env.validation.ts).
 *
 * Produces a deterministic straight-line estimate so the matching engine, the
 * pricing engine and the test suite can run without a vendor account or network
 * access. It is NOT a road router: it does not know about roads, one-way
 * streets or traffic, and it must never be used to quote a real fare.
 */
export class HaversineRoutingProvider implements RoutingProvider {
  readonly name = 'haversine';

  /**
   * @param averageSpeedKph Assumed constant speed used to derive durations.
   * @param roadFactor Multiplier approximating the excess of road distance over
   *   great-circle distance (1.3 is a common urban rule of thumb).
   */
  constructor(
    private readonly averageSpeedKph = 35,
    private readonly roadFactor = 1.3,
  ) {}

  async route(request: RouteRequest): Promise<RouteResult> {
    const waypoints = request.waypoints;
    if (waypoints.length < 2) {
      throw new Error('A route requires at least an origin and a destination');
    }

    const legs = [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 1; i < waypoints.length; i += 1) {
      const straight = haversineMeters(waypoints[i - 1], waypoints[i]);
      const distanceM = Math.round(straight * this.roadFactor);
      const durationS = Math.round((distanceM / 1000 / this.averageSpeedKph) * 3600);
      legs.push({ distanceM, durationS });
      totalDistance += distanceM;
      totalDuration += durationS;
    }

    // Densify each leg so the resulting LineString behaves like a real
    // polyline under ST_LineLocatePoint and ST_DWithin.
    const path = this.densify(waypoints);

    return {
      provider: this.name,
      encodedPolyline: encodePolyline(path, 5),
      path,
      distanceM: totalDistance,
      durationS: totalDuration,
      legs,
    };
  }

  private densify(waypoints: readonly LatLng[], pointsPerLeg = 12): LatLng[] {
    const path: LatLng[] = [waypoints[0]];
    for (let i = 1; i < waypoints.length; i += 1) {
      const a = waypoints[i - 1];
      const b = waypoints[i];
      for (let step = 1; step <= pointsPerLeg; step += 1) {
        const t = step / pointsPerLeg;
        path.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
      }
    }
    return path;
  }

  async geocode(query: string): Promise<GeocodeResult[]> {
    // No offline gazetteer — callers must supply coordinates in development.
    void query;
    return [];
  }

  async reverseGeocode(point: LatLng): Promise<GeocodeResult | null> {
    return {
      address: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      location: point,
    };
  }
}

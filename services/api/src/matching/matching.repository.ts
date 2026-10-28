import { Injectable } from '@nestjs/common';
import { Gender, Prisma, SharedRideGenderPreference } from '@prisma/client';
import { LatLng } from '../common/utils/geo';
import { PrismaService } from '../prisma/prisma.service';
import { CandidateGeometry, ExistingRider } from './matching.types';
import { PlannedStop } from './stop-sequencer';

interface CandidateRow {
  ride_id: string;
  driver_id: string | null;
  driver_gender: Gender | null;
  vehicle_type_id: string;
  shared_ride_eligible: boolean;
  seats_total: number;
  seats_occupied: number;
  scheduled_pickup_at: Date | null;
  started_at: Date | null;
  status: string;
  route_id: string;
  route_distance_m: number;
  route_duration_s: number;
  encoded_polyline: string;
  pickup_distance_m: number;
  dropoff_distance_m: number;
  pickup_fraction: number;
  dropoff_fraction: number;
  driver_progress_fraction: number;
  driver_location_age_s: number | null;
  driver_lat: number | null;
  driver_lng: number | null;
  shared_segment_m: number;
  driver_remaining_m: number;
  segment_bearing_deg: number;
  route_start_lat: number;
  route_start_lng: number;
}

interface PendingStopRow {
  id: string;
  ride_id: string;
  ride_passenger_id: string | null;
  type: 'PICKUP' | 'DROPOFF' | 'WAYPOINT';
  address: string;
  latitude: number;
  longitude: number;
  route_fraction: number | null;
}

interface ExistingRiderRow {
  id: string;
  ride_id: string;
  user_id: string;
  gender_snapshot: Gender;
  gender_preference: SharedRideGenderPreference;
  seats_requested: number;
  estimated_dropoff_at: Date | null;
  status: string;
  pickup_fraction: number | null;
  dropoff_fraction: number | null;
}

/**
 * All geodesic measurement happens here, inside PostgreSQL.
 *
 * Doing it in SQL rather than in application code means the shortlist filter
 * (`ST_DWithin`) and the measurements that follow use the same geometry and the
 * same geodesic maths as the GiST index, so a candidate can never be selected
 * by the index and then measured differently in memory.
 *
 * Every value is bound as a parameter — no fragment of any query is assembled
 * from user input.
 */
@Injectable()
export class MatchingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Shortlists joinable rides whose active route passes within the configured
   * corridor of BOTH the requested pickup and the requested drop-off, and
   * measures each one.
   *
   * Corridor containment of both endpoints is applied in the WHERE clause so
   * the spatial index does the elimination; ordering, direction, detour, time
   * and safety are decided afterwards by the rule kernel.
   */
  async findCandidates(params: {
    pickup: LatLng;
    dropoff: LatLng;
    vehicleTypeId: string | null;
    seatsRequested: number;
    pickupRadiusM: number;
    dropoffRadiusM: number;
    driverSearchRadiusM: number;
    limit: number;
  }): Promise<CandidateGeometry[]> {
    const rows = await this.prisma.$queryRaw<CandidateRow[]>`
      WITH req AS (
        SELECT
          ST_SetSRID(ST_MakePoint(${params.pickup.lng}::double precision,
                                  ${params.pickup.lat}::double precision), 4326)::geography  AS pickup,
          ST_SetSRID(ST_MakePoint(${params.dropoff.lng}::double precision,
                                  ${params.dropoff.lat}::double precision), 4326)::geography AS dropoff
      ),
      base AS (
        SELECT
          r.id                          AS ride_id,
          r.status::text                AS status,
          r.driver_id                   AS driver_id,
          du.gender                     AS driver_gender,
          r.vehicle_type_id             AS vehicle_type_id,
          vt.shared_ride_eligible       AS shared_ride_eligible,
          r.seats_total                 AS seats_total,
          r.seats_occupied              AS seats_occupied,
          r.scheduled_pickup_at         AS scheduled_pickup_at,
          r.started_at                  AS started_at,
          rr.id                         AS route_id,
          rr.distance_m                 AS route_distance_m,
          rr.duration_s                 AS route_duration_s,
          rr.encoded_polyline           AS encoded_polyline,
          rr.geometry::geometry         AS route_geom,
          ST_Distance(rr.geometry, req.pickup)::double precision   AS pickup_distance_m,
          ST_Distance(rr.geometry, req.dropoff)::double precision  AS dropoff_distance_m,
          ST_LineLocatePoint(rr.geometry::geometry, req.pickup::geometry)::double precision  AS pickup_fraction,
          ST_LineLocatePoint(rr.geometry::geometry, req.dropoff::geometry)::double precision AS dropoff_fraction,
          COALESCE(
            ST_LineLocatePoint(rr.geometry::geometry, dl.location::geometry),
            0
          )::double precision           AS driver_progress_fraction,
          EXTRACT(EPOCH FROM (now() - dl.recorded_at))::double precision AS driver_location_age_s,
          dl.latitude::double precision  AS driver_lat,
          dl.longitude::double precision AS driver_lng
        FROM rides r
        JOIN ride_routes rr        ON rr.id = r.active_route_id
        JOIN vehicle_types vt      ON vt.id = r.vehicle_type_id
        JOIN drivers d             ON d.id = r.driver_id
        JOIN users du              ON du.id = d.user_id
        LEFT JOIN driver_locations_current dl ON dl.driver_id = r.driver_id
        CROSS JOIN req
        WHERE r.joinable
          AND r.ride_type = 'SHARED'
          AND r.status IN ('SCHEDULED', 'ACCEPTED', 'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS')
          AND vt.shared_ride_eligible
          AND d.approval_status = 'APPROVED'
          AND d.deleted_at IS NULL
          AND (r.seats_total - r.seats_occupied) >= ${params.seatsRequested}
          AND (${params.vehicleTypeId}::uuid IS NULL OR r.vehicle_type_id = ${params.vehicleTypeId}::uuid)
          AND ST_DWithin(rr.geometry, req.pickup,  ${params.pickupRadiusM}::double precision)
          AND ST_DWithin(rr.geometry, req.dropoff, ${params.dropoffRadiusM}::double precision)
          AND (
            dl.driver_id IS NULL
            OR ST_DWithin(dl.location, req.pickup, ${params.driverSearchRadiusM}::double precision)
          )
      )
      SELECT
        base.ride_id,
        base.status,
        base.driver_id,
        base.driver_gender,
        base.vehicle_type_id,
        base.shared_ride_eligible,
        base.seats_total,
        base.seats_occupied,
        base.scheduled_pickup_at,
        base.started_at,
        base.route_id,
        base.route_distance_m,
        base.route_duration_s,
        base.encoded_polyline,
        base.pickup_distance_m,
        base.dropoff_distance_m,
        base.pickup_fraction,
        base.dropoff_fraction,
        base.driver_progress_fraction,
        base.driver_location_age_s,
        base.driver_lat,
        base.driver_lng,
        -- Geodesic length of the driver's own road between the two projections.
        COALESCE(
          ST_Length(
            ST_LineSubstring(
              base.route_geom,
              LEAST(base.pickup_fraction, base.dropoff_fraction),
              GREATEST(base.pickup_fraction, base.dropoff_fraction)
            )::geography
          ), 0
        )::double precision AS shared_segment_m,
        -- Geodesic length still ahead of the driver.
        CASE
          WHEN base.driver_progress_fraction >= 1 THEN 0
          ELSE COALESCE(
            ST_Length(ST_LineSubstring(base.route_geom, base.driver_progress_fraction, 1)::geography),
            0
          )
        END::double precision AS driver_remaining_m,
        -- Direction the driver actually travels across the shared segment.
        COALESCE(
          degrees(
            ST_Azimuth(
              ST_LineInterpolatePoint(base.route_geom, LEAST(base.pickup_fraction, base.dropoff_fraction))::geography,
              ST_LineInterpolatePoint(base.route_geom, GREATEST(base.pickup_fraction, base.dropoff_fraction))::geography
            )
          ), 0
        )::double precision AS segment_bearing_deg,
        ST_Y(ST_StartPoint(base.route_geom))::double precision AS route_start_lat,
        ST_X(ST_StartPoint(base.route_geom))::double precision AS route_start_lng
      FROM base
      ORDER BY (base.pickup_distance_m + base.dropoff_distance_m) ASC
      LIMIT ${params.limit}
    `;

    return rows.map((row) => ({
      rideId: row.ride_id,
      status: row.status as CandidateGeometry['status'],
      driverId: row.driver_id,
      driverGender: row.driver_gender,
      vehicleTypeId: row.vehicle_type_id,
      seatsTotal: Number(row.seats_total),
      seatsOccupied: Number(row.seats_occupied),
      routeId: row.route_id,
      routeDistanceM: Number(row.route_distance_m),
      routeDurationS: Number(row.route_duration_s),
      encodedPolyline: row.encoded_polyline,
      scheduledPickupAt: row.scheduled_pickup_at,
      rideStartedAt: row.started_at,
      pickupDistanceM: Number(row.pickup_distance_m),
      dropoffDistanceM: Number(row.dropoff_distance_m),
      pickupFraction: Number(row.pickup_fraction),
      dropoffFraction: Number(row.dropoff_fraction),
      driverProgressFraction: Number(row.driver_progress_fraction),
      driverLocationAgeS:
        row.driver_location_age_s === null ? null : Number(row.driver_location_age_s),
      driverLat: row.driver_lat === null ? null : Number(row.driver_lat),
      driverLng: row.driver_lng === null ? null : Number(row.driver_lng),
      sharedSegmentM: Number(row.shared_segment_m),
      driverRemainingM: Number(row.driver_remaining_m),
      segmentBearingDeg: Number(row.segment_bearing_deg),
      routeStart: { lat: Number(row.route_start_lat), lng: Number(row.route_start_lng) },
    }));
  }

  /**
   * Loads the riders already committed to each candidate ride, with their stop
   * positions along the driver's active route.
   *
   * Gender and preference are read here because the matching engine needs them;
   * they are never propagated into any response DTO.
   */
  async findExistingRiders(rideIds: readonly string[]): Promise<Map<string, ExistingRider[]>> {
    const result = new Map<string, ExistingRider[]>();
    if (rideIds.length === 0) {
      return result;
    }

    const rows = await this.prisma.$queryRaw<ExistingRiderRow[]>`
      SELECT
        rp.id,
        rp.ride_id,
        rp.user_id,
        rp.gender_snapshot,
        rp.gender_preference,
        rp.seats_requested,
        rp.estimated_dropoff_at,
        rp.status::text AS status,
        ST_LineLocatePoint(rr.geometry::geometry, rp.pickup_location::geometry)::double precision  AS pickup_fraction,
        ST_LineLocatePoint(rr.geometry::geometry, rp.dropoff_location::geometry)::double precision AS dropoff_fraction
      FROM ride_passengers rp
      JOIN rides r      ON r.id = rp.ride_id
      JOIN ride_routes rr ON rr.id = r.active_route_id
      WHERE rp.ride_id = ANY(ARRAY[${Prisma.join(rideIds as string[])}]::uuid[])
        AND rp.status IN ('CONFIRMED', 'AWAITING_PICKUP', 'ONBOARD')
    `;

    for (const row of rows) {
      const rider: ExistingRider = {
        ridePassengerId: row.id,
        userId: row.user_id,
        gender: row.gender_snapshot,
        preference: row.gender_preference,
        seats: Number(row.seats_requested),
        pickupFraction: row.pickup_fraction === null ? null : Number(row.pickup_fraction),
        dropoffFraction: row.dropoff_fraction === null ? null : Number(row.dropoff_fraction),
        estimatedDropoffAt: row.estimated_dropoff_at,
        alreadyOnboard: row.status === 'ONBOARD',
      };

      const list = result.get(row.ride_id);
      if (list) {
        list.push(rider);
      } else {
        result.set(row.ride_id, [rider]);
      }
    }

    return result;
  }

  /**
   * The stops a ride still has to serve, projected onto its active route.
   *
   * Completed and skipped stops are excluded: re-planning is always done from
   * where the driver is now, over what is left to do.
   */
  async findPendingStops(rideIds: readonly string[]): Promise<Map<string, PlannedStop[]>> {
    const result = new Map<string, PlannedStop[]>();
    if (rideIds.length === 0) {
      return result;
    }

    const rows = await this.prisma.$queryRaw<PendingStopRow[]>`
      SELECT
        s.id,
        s.ride_id,
        s.ride_passenger_id,
        s.type::text AS type,
        s.address,
        s.latitude::double precision  AS latitude,
        s.longitude::double precision AS longitude,
        ST_LineLocatePoint(rr.geometry::geometry, s.location::geometry)::double precision AS route_fraction
      FROM ride_stops s
      JOIN rides r        ON r.id = s.ride_id
      JOIN ride_routes rr ON rr.id = r.active_route_id
      WHERE s.ride_id = ANY(ARRAY[${Prisma.join(rideIds as string[])}]::uuid[])
        AND s.status = 'PENDING'
      ORDER BY s.ride_id, s.sequence
    `;

    for (const row of rows) {
      const stop: PlannedStop = {
        key: row.id,
        ridePassengerId: row.ride_passenger_id,
        type: row.type as PlannedStop['type'],
        address: row.address,
        location: { lat: Number(row.latitude), lng: Number(row.longitude) },
        routeFraction: row.route_fraction === null ? 0 : Number(row.route_fraction),
      };

      const list = result.get(row.ride_id);
      if (list) {
        list.push(stop);
      } else {
        result.set(row.ride_id, [stop]);
      }
    }

    return result;
  }
}

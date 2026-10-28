import { Injectable, Logger } from '@nestjs/common';
import { ServiceType } from '@prisma/client';
import { LatLng } from '../common/utils/geo';
import { PrismaService } from '../prisma/prisma.service';
import { SETTING_KEYS } from '../settings/settings.registry';
import { SettingsService } from '../settings/settings.service';

export interface CourierCandidate {
  driverId: string;
  userId: string;
  firstName: string;
  vehicleId: string | null;
  vehicleTypeCode: string;
  distanceM: number;
  ratingAverage: string;
  locationAgeS: number;
}

interface CandidateRow {
  driver_id: string;
  user_id: string;
  first_name: string;
  vehicle_id: string | null;
  vehicle_type_code: string;
  distance_m: number;
  rating_average: string;
  location_age_s: number;
}

/**
 * Finds couriers who could take a job, for both food and parcel work.
 *
 * This is deliberately a **candidate query, not an auto-dispatcher**. It answers
 * "who is genuinely able to do this job right now", ranked nearest-first, and
 * leaves the claim to the courier. Jobs are offered to the shortlist and the
 * first courier to accept wins, settled atomically by the caller.
 *
 * That boundary is the point: choosing *how* to allocate — broadcast, sequential
 * offer, forced assignment, batching — is a business decision the operator has
 * not made yet. Swapping strategies later means calling this differently, not
 * rewriting eligibility.
 *
 * Eligibility is not negotiable, and mirrors what the ride dispatcher already
 * requires: an approved driver, online, with a fresh position, an active vehicle
 * of a class permitted for this work, and no other live job.
 */
@Injectable()
export class DeliveryAssignmentService {
  private readonly logger = new Logger(DeliveryAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async findCandidates(params: {
    collectionPoint: LatLng;
    serviceType: typeof ServiceType.FOOD_DELIVERY | typeof ServiceType.PARCEL;
    /** Restricts to a vehicle class, e.g. a parcel that needs a van. */
    vehicleTypeId?: string | null;
    /** Overrides the configured search radius, e.g. for a widening retry. */
    radiusM?: number;
  }): Promise<CourierCandidate[]> {
    const [configuredRadius, maxCandidates, staleAfterS] = await Promise.all([
      this.settings.getNumber(SETTING_KEYS.DELIVERY_SEARCH_RADIUS_M),
      this.settings.getNumber(SETTING_KEYS.DELIVERY_MAX_OFFER_CANDIDATES),
      this.settings.getNumber(SETTING_KEYS.LOCATION_STALE_AFTER_S),
    ]);

    const radiusM = params.radiusM ?? configuredRadius;
    const wantsFood = params.serviceType === ServiceType.FOOD_DELIVERY;

    const rows = await this.prisma.$queryRaw<CandidateRow[]>`
      WITH origin AS (
        SELECT ST_SetSRID(
                 ST_MakePoint(${params.collectionPoint.lng}::double precision,
                              ${params.collectionPoint.lat}::double precision),
                 4326)::geography AS g
      )
      SELECT
        d.id                          AS driver_id,
        u.id                          AS user_id,
        u.first_name                  AS first_name,
        da.active_vehicle_id          AS vehicle_id,
        vt.code                       AS vehicle_type_code,
        ST_Distance(dl.location, origin.g)::double precision      AS distance_m,
        d.rating_average::text                                    AS rating_average,
        EXTRACT(EPOCH FROM (now() - dl.recorded_at))::double precision AS location_age_s
      FROM driver_availability da
      JOIN drivers d                  ON d.id = da.driver_id
      JOIN users u                    ON u.id = d.user_id
      JOIN driver_locations_current dl ON dl.driver_id = d.id
      JOIN vehicles v                 ON v.id = da.active_vehicle_id
      JOIN vehicle_types vt           ON vt.id = v.vehicle_type_id
      CROSS JOIN origin
      WHERE da.presence = 'ONLINE'
        AND d.approval_status = 'APPROVED'
        AND d.deleted_at IS NULL
        AND u.status = 'ACTIVE'
        AND v.status = 'ACTIVE'
        AND v.deleted_at IS NULL
        -- the courier has opted in to this kind of work, and the vehicle class
        -- is permitted to carry it
        AND (${wantsFood}::boolean AND da.accepts_food AND vt.food_delivery_eligible
             OR NOT ${wantsFood}::boolean AND da.accepts_parcel AND vt.parcel_eligible)
        AND (${params.vehicleTypeId}::uuid IS NULL OR v.vehicle_type_id = ${params.vehicleTypeId}::uuid)
        -- a stale position is not evidence of where somebody is
        AND EXTRACT(EPOCH FROM (now() - dl.recorded_at)) <= ${staleAfterS}::double precision
        AND ST_DWithin(dl.location, origin.g, ${radiusM}::double precision)
        -- and they must not already be carrying something
        AND NOT EXISTS (
          SELECT 1 FROM rides r
          WHERE r.driver_id = d.id
            AND r.status IN ('ACCEPTED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS')
        )
        AND NOT EXISTS (
          SELECT 1 FROM food_deliveries fd
          WHERE fd.driver_id = d.id
            AND fd.status IN ('ASSIGNED','HEADING_TO_PICKUP','AT_PICKUP','PICKED_UP','DELIVERING')
        )
        AND NOT EXISTS (
          SELECT 1 FROM parcel_orders po
          WHERE po.driver_id = d.id
            AND po.status IN ('ASSIGNED','HEADING_TO_PICKUP','PICKED_UP','IN_TRANSIT')
        )
      ORDER BY distance_m ASC
      LIMIT ${maxCandidates}
    `;

    return rows.map((row) => ({
      driverId: row.driver_id,
      userId: row.user_id,
      firstName: row.first_name,
      vehicleId: row.vehicle_id,
      vehicleTypeCode: row.vehicle_type_code,
      distanceM: Math.round(Number(row.distance_m)),
      ratingAverage: row.rating_average,
      locationAgeS: Math.round(Number(row.location_age_s)),
    }));
  }

  /**
   * Whether one specific courier is free to take on work.
   *
   * Used at the moment a courier claims a job. It is a fast pre-check that
   * produces a clear message; the authoritative guarantee is the partial unique
   * index on each delivery table, which refuses a second live job outright.
   */
  async isCourierFree(driverId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ busy: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM rides r
        WHERE r.driver_id = ${driverId}::uuid
          AND r.status IN ('ACCEPTED','DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS')
        UNION ALL
        SELECT 1 FROM food_deliveries fd
        WHERE fd.driver_id = ${driverId}::uuid
          AND fd.status IN ('ASSIGNED','HEADING_TO_PICKUP','AT_PICKUP','PICKED_UP','DELIVERING')
        UNION ALL
        SELECT 1 FROM parcel_orders po
        WHERE po.driver_id = ${driverId}::uuid
          AND po.status IN ('ASSIGNED','HEADING_TO_PICKUP','PICKED_UP','IN_TRANSIT')
      ) AS busy
    `;

    return !rows[0]?.busy;
  }
}

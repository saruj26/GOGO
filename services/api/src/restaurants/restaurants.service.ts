import { Injectable } from '@nestjs/common';
import { Prisma, RestaurantStatus } from '@prisma/client';
import { buildCursorPage } from '../common/dto/pagination.dto';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { BrowseRestaurantsDto } from './dto/restaurants.dto';

interface RestaurantListRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  is_accepting_orders: boolean;
  default_prep_minutes: number;
  min_order_amount: string;
  rating_average: string;
  rating_count: number;
  address_line: string;
  distance_m: number | null;
  within_delivery_range: boolean | null;
}

/**
 * The customer-facing restaurant catalogue.
 *
 * Everything here is read-only and safe for any signed-in customer. Commission
 * rates, owner identities and staff lists are never included — those belong to
 * the portal and to admin.
 */
@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Browse or search restaurants.
   *
   * When the customer's position is supplied, results are ranked by real
   * distance using the GiST-indexed location column, and each row states whether
   * the customer is inside that restaurant's delivery radius — so the client
   * never has to guess.
   */
  async browse(dto: BrowseRestaurantsDto) {
    const hasLocation = dto.lat !== undefined && dto.lng !== undefined;
    const search = dto.q?.trim();
    const limit = dto.limit;

    // Raw SQL rather than Prisma here because the query needs PostGIS distance
    // and trigram ranking, neither of which Prisma can express.
    const rows = await this.prisma.$queryRaw<RestaurantListRow[]>`
      WITH origin AS (
        SELECT CASE
          WHEN ${hasLocation}::boolean THEN
            ST_SetSRID(ST_MakePoint(${dto.lng ?? 0}::double precision,
                                    ${dto.lat ?? 0}::double precision), 4326)::geography
          ELSE NULL
        END AS g
      )
      SELECT
        r.id,
        r.name,
        r.slug,
        r.description,
        r.logo_url,
        r.cover_url,
        r.is_accepting_orders,
        r.default_prep_minutes,
        r.min_order_amount::text  AS min_order_amount,
        r.rating_average::text    AS rating_average,
        r.rating_count,
        r.address_line,
        CASE WHEN origin.g IS NULL THEN NULL
             ELSE ST_Distance(r.location, origin.g)::double precision END AS distance_m,
        CASE WHEN origin.g IS NULL THEN NULL
             ELSE ST_DWithin(r.location, origin.g, r.delivery_radius_m::double precision) END
          AS within_delivery_range
      FROM restaurants r
      CROSS JOIN origin
      WHERE r.deleted_at IS NULL
        AND r.status = 'ACTIVE'
        AND (NOT ${dto.openOnly ?? false}::boolean OR r.is_accepting_orders)
        AND (${search ?? null}::text IS NULL OR r.name ILIKE '%' || ${search ?? ''} || '%')
        AND (origin.g IS NULL OR ST_DWithin(r.location, origin.g, r.delivery_radius_m::double precision))
        AND (${dto.cursor ?? null}::uuid IS NULL OR r.id > ${dto.cursor ?? null}::uuid)
      ORDER BY
        CASE WHEN origin.g IS NULL THEN NULL ELSE ST_Distance(r.location, origin.g) END ASC NULLS LAST,
        r.rating_average DESC,
        r.id ASC
      LIMIT ${limit + 1}
    `;

    const mapped = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      logoUrl: row.logo_url,
      coverUrl: row.cover_url,
      isAcceptingOrders: row.is_accepting_orders,
      prepMinutes: row.default_prep_minutes,
      minOrderAmount: row.min_order_amount,
      rating: { average: row.rating_average, count: row.rating_count },
      address: row.address_line,
      distanceM: row.distance_m === null ? null : Math.round(Number(row.distance_m)),
      withinDeliveryRange: row.within_delivery_range,
    }));

    return buildCursorPage(mapped, limit);
  }

  /**
   * One restaurant with its menu.
   *
   * Unavailable items are returned with `available: false` rather than hidden,
   * so a customer sees that a dish exists but is off today instead of wondering
   * where it went.
   */
  async findOne(idOrSlug: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);

    const restaurant = await this.prisma.restaurant.findFirst({
      where: {
        deletedAt: null,
        status: RestaurantStatus.ACTIVE,
        ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        phone: true,
        logoUrl: true,
        coverUrl: true,
        isAcceptingOrders: true,
        defaultPrepMinutes: true,
        minOrderAmount: true,
        ratingAverage: true,
        ratingCount: true,
        addressLine: true,
        latitude: true,
        longitude: true,
        deliveryRadiusM: true,
        hours: {
          orderBy: [{ dayOfWeek: 'asc' }, { opensAt: 'asc' }],
          select: { dayOfWeek: true, opensAt: true, closesAt: true },
        },
        categories: {
          where: { active: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            sortOrder: true,
            items: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
                currency: true,
                imageUrl: true,
                available: true,
                prepMinutes: true,
              },
            },
          },
        },
      },
    });

    if (!restaurant) throw DomainError.notFound('Restaurant');

    return {
      ...restaurant,
      minOrderAmount: restaurant.minOrderAmount.toFixed(2),
      rating: {
        average: restaurant.ratingAverage.toFixed(2),
        count: restaurant.ratingCount,
      },
      categories: restaurant.categories.map((category) => ({
        ...category,
        items: category.items.map((item) => ({ ...item, price: item.price.toFixed(2) })),
      })),
    };
  }

  /**
   * Loads a restaurant for ordering and asserts it can actually take the order.
   * Used at checkout, where "closed" must be an error rather than a surprise.
   */
  async assertOrderable(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        isAcceptingOrders: true,
        minOrderAmount: true,
        commissionPct: true,
        defaultPrepMinutes: true,
        deliveryRadiusM: true,
        latitude: true,
        longitude: true,
        addressLine: true,
      },
    });

    if (!restaurant) throw DomainError.notFound('Restaurant');

    if (restaurant.status !== RestaurantStatus.ACTIVE) {
      throw new DomainError(
        DomainErrorCode.RESTAURANT_UNAVAILABLE,
        `${restaurant.name} is not currently available on the platform.`,
      );
    }

    if (!restaurant.isAcceptingOrders) {
      throw new DomainError(
        DomainErrorCode.RESTAURANT_UNAVAILABLE,
        `${restaurant.name} is not taking orders right now.`,
      );
    }

    return restaurant;
  }

  /**
   * Confirms the signed-in user may act for this restaurant, and returns their
   * role in it.
   *
   * Every portal operation goes through here. Membership is read from the
   * database on each call rather than trusted from a token, so revoking a staff
   * member takes effect immediately.
   */
  async assertMember(
    restaurantId: string,
    userId: string,
    require: 'ANY' | 'OWNER' = 'ANY',
  ): Promise<{ restaurantId: string; role: string }> {
    const membership = await this.prisma.restaurantUser.findUnique({
      where: { restaurantId_userId: { restaurantId, userId } },
      select: { role: true, restaurant: { select: { deletedAt: true } } },
    });

    if (!membership || membership.restaurant.deletedAt) {
      // Deliberately "not found", not "forbidden": whether a restaurant exists
      // is not something a non-member should be able to probe.
      throw DomainError.notFound('Restaurant');
    }

    if (require === 'OWNER' && membership.role !== 'OWNER') {
      throw DomainError.forbidden('Only a restaurant owner can do that.');
    }

    return { restaurantId, role: membership.role };
  }

  /** The restaurants the signed-in user works for. */
  async myRestaurants(userId: string) {
    const memberships = await this.prisma.restaurantUser.findMany({
      where: { userId, restaurant: { deletedAt: null } },
      select: {
        role: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            isAcceptingOrders: true,
            logoUrl: true,
          },
        },
      },
    });

    return memberships.map((m) => ({ ...m.restaurant, myRole: m.role }));
  }

  /** Distance in metres from a restaurant to a delivery point. */
  async deliveryDistanceM(
    restaurantId: string,
    destination: { lat: number; lng: number },
  ): Promise<{ distanceM: number; withinRange: boolean }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ distance_m: number; within_range: boolean }>
    >`
      SELECT
        ST_Distance(
          r.location,
          ST_SetSRID(ST_MakePoint(${destination.lng}::double precision,
                                  ${destination.lat}::double precision), 4326)::geography
        )::double precision AS distance_m,
        ST_DWithin(
          r.location,
          ST_SetSRID(ST_MakePoint(${destination.lng}::double precision,
                                  ${destination.lat}::double precision), 4326)::geography,
          r.delivery_radius_m::double precision
        ) AS within_range
      FROM restaurants r
      WHERE r.id = ${restaurantId}::uuid
    `;

    const row = rows[0];
    if (!row) throw DomainError.notFound('Restaurant');

    return { distanceM: Math.round(Number(row.distance_m)), withinRange: row.within_range };
  }

  /** Restaurant coordinates, for routing and courier search. */
  async location(restaurantId: string): Promise<{ lat: number; lng: number; address: string }> {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { latitude: true, longitude: true, addressLine: true },
    });

    return {
      lat: Number(restaurant.latitude),
      lng: Number(restaurant.longitude),
      address: restaurant.addressLine,
    };
  }
}

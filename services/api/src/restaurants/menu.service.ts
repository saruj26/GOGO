import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMenuItemDto,
  UpdateMenuItemDto,
  UpdateRestaurantProfileDto,
  UpsertMenuCategoryDto,
} from './dto/restaurants.dto';
import { RestaurantsService } from './restaurants.service';

/**
 * Menu and profile management for restaurant staff.
 *
 * Every method takes the restaurant id from the URL and the user id from the
 * verified token, and confirms membership before touching anything — a staff
 * member of one restaurant cannot reach another's menu by changing an id.
 */
@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly audit: AuditService,
  ) {}

  async updateProfile(restaurantId: string, userId: string, dto: UpdateRestaurantProfileDto) {
    await this.restaurants.assertMember(restaurantId, userId, 'OWNER');

    const previous = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: {
        description: true,
        phone: true,
        isAcceptingOrders: true,
        defaultPrepMinutes: true,
        minOrderAmount: true,
        deliveryRadiusM: true,
      },
    });

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        description: dto.description,
        phone: dto.phone,
        logoUrl: dto.logoUrl,
        coverUrl: dto.coverUrl,
        isAcceptingOrders: dto.isAcceptingOrders,
        defaultPrepMinutes: dto.defaultPrepMinutes,
        minOrderAmount: dto.minOrderAmount,
        deliveryRadiusM: dto.deliveryRadiusM,
      },
      select: {
        id: true,
        name: true,
        description: true,
        phone: true,
        logoUrl: true,
        coverUrl: true,
        isAcceptingOrders: true,
        defaultPrepMinutes: true,
        minOrderAmount: true,
        deliveryRadiusM: true,
      },
    });

    // Commission is deliberately absent from both the DTO and this update: a
    // restaurant must not be able to change what the platform charges it.
    await this.audit.record({
      actorUserId: userId,
      action: 'restaurant.profile.update',
      entityType: 'Restaurant',
      entityId: restaurantId,
      previousState: previous,
      newState: dto as Record<string, unknown>,
    });

    return { ...updated, minOrderAmount: updated.minOrderAmount.toFixed(2) };
  }

  // ---------------------------------------------------------------- categories

  async listCategories(restaurantId: string, userId: string) {
    await this.restaurants.assertMember(restaurantId, userId);

    return this.prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        active: true,
        _count: { select: { items: true } },
      },
    });
  }

  async createCategory(restaurantId: string, userId: string, dto: UpsertMenuCategoryDto) {
    await this.restaurants.assertMember(restaurantId, userId);

    try {
      return await this.prisma.menuCategory.create({
        data: {
          restaurantId,
          name: dto.name,
          sortOrder: dto.sortOrder ?? 0,
          active: dto.active ?? true,
        },
        select: { id: true, name: true, sortOrder: true, active: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw DomainError.conflict(
          DomainErrorCode.CONFLICT,
          `You already have a category called “${dto.name}”.`,
        );
      }
      throw error;
    }
  }

  async updateCategory(
    restaurantId: string,
    userId: string,
    categoryId: string,
    dto: UpsertMenuCategoryDto,
  ) {
    await this.restaurants.assertMember(restaurantId, userId);

    // Scoped by restaurantId as well as id, so a category id belonging to
    // another restaurant simply does not match.
    const result = await this.prisma.menuCategory.updateMany({
      where: { id: categoryId, restaurantId },
      data: { name: dto.name, sortOrder: dto.sortOrder, active: dto.active },
    });

    if (result.count === 0) throw DomainError.notFound('Menu category');

    return this.prisma.menuCategory.findUniqueOrThrow({
      where: { id: categoryId },
      select: { id: true, name: true, sortOrder: true, active: true },
    });
  }

  // --------------------------------------------------------------------- items

  async listItems(restaurantId: string, userId: string, categoryId?: string) {
    await this.restaurants.assertMember(restaurantId, userId);

    const items = await this.prisma.menuItem.findMany({
      where: { restaurantId, deletedAt: null, ...(categoryId ? { categoryId } : {}) },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        categoryId: true,
        name: true,
        description: true,
        price: true,
        currency: true,
        imageUrl: true,
        available: true,
        prepMinutes: true,
        sortOrder: true,
      },
    });

    return items.map((item) => ({ ...item, price: item.price.toFixed(2) }));
  }

  async createItem(restaurantId: string, userId: string, dto: CreateMenuItemDto) {
    await this.restaurants.assertMember(restaurantId, userId);
    await this.assertCategoryBelongs(restaurantId, dto.categoryId);

    const item = await this.prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        imageUrl: dto.imageUrl,
        available: dto.available ?? true,
        prepMinutes: dto.prepMinutes,
        sortOrder: dto.sortOrder ?? 0,
      },
      select: { id: true, name: true, price: true, available: true, categoryId: true },
    });

    await this.audit.record({
      actorUserId: userId,
      action: 'menu.item.create',
      entityType: 'MenuItem',
      entityId: item.id,
      newState: { restaurantId, name: dto.name, price: dto.price },
    });

    return { ...item, price: item.price.toFixed(2) };
  }

  async updateItem(
    restaurantId: string,
    userId: string,
    itemId: string,
    dto: UpdateMenuItemDto,
  ) {
    await this.restaurants.assertMember(restaurantId, userId);

    if (dto.categoryId) {
      await this.assertCategoryBelongs(restaurantId, dto.categoryId);
    }

    const previous = await this.prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId, deletedAt: null },
      select: { price: true, available: true, name: true },
    });

    if (!previous) throw DomainError.notFound('Menu item');

    const item = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        imageUrl: dto.imageUrl,
        available: dto.available,
        prepMinutes: dto.prepMinutes,
        sortOrder: dto.sortOrder,
      },
      select: { id: true, name: true, price: true, available: true, categoryId: true },
    });

    // A price change matters to a dispute, so it is audited. Orders already
    // placed are unaffected: each order line snapshots the price it was sold at.
    if (dto.price !== undefined && !previous.price.equals(dto.price)) {
      await this.audit.record({
        actorUserId: userId,
        action: 'menu.item.reprice',
        entityType: 'MenuItem',
        entityId: itemId,
        previousState: { price: previous.price.toFixed(2) },
        newState: { price: item.price.toFixed(2) },
      });
    }

    return { ...item, price: item.price.toFixed(2) };
  }

  /** Toggles availability — the fast path a kitchen uses when it runs out. */
  async setAvailability(
    restaurantId: string,
    userId: string,
    itemId: string,
    available: boolean,
  ) {
    await this.restaurants.assertMember(restaurantId, userId);

    const result = await this.prisma.menuItem.updateMany({
      where: { id: itemId, restaurantId, deletedAt: null },
      data: { available },
    });

    if (result.count === 0) throw DomainError.notFound('Menu item');

    return { id: itemId, available };
  }

  /**
   * Soft-deletes an item. Historical order lines keep their own name and price
   * snapshots, so past orders remain readable after the dish is withdrawn.
   */
  async removeItem(restaurantId: string, userId: string, itemId: string) {
    await this.restaurants.assertMember(restaurantId, userId);

    const result = await this.prisma.menuItem.updateMany({
      where: { id: itemId, restaurantId, deletedAt: null },
      data: { deletedAt: new Date(), available: false },
    });

    if (result.count === 0) throw DomainError.notFound('Menu item');

    return { id: itemId, removed: true };
  }

  private async assertCategoryBelongs(restaurantId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
      select: { id: true },
    });

    if (!category) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'That menu category does not belong to this restaurant.',
      );
    }
  }
}

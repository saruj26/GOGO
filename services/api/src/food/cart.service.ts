import { Injectable } from '@nestjs/common';
import { FoodOrderStatus, Prisma } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { money, round2, sum } from '../common/utils/money';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { SETTING_KEYS } from '../settings/settings.registry';
import { SettingsService } from '../settings/settings.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/food.dto';
import { FOOD_TRANSACTION_OPTIONS } from './food-orders.service';

/**
 * The shopping cart.
 *
 * A cart is a food order in DRAFT — the same row, the same lines, the same
 * constraints. That means checkout is a status transition rather than a
 * translation between two models, and a half-built cart is already subject to
 * every invariant the schema enforces on an order.
 *
 * `food_orders_one_draft_per_user_restaurant` guarantees a customer has at most
 * one open cart per restaurant, so a double-tapped "add to cart" cannot leave
 * two competing carts behind.
 *
 * Prices in a cart are advisory. They are re-read from the menu at checkout,
 * because a cart may sit for hours.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
    private readonly settings: SettingsService,
  ) {}

  async addItem(userId: string, dto: AddCartItemDto) {
    const maxQuantity = await this.settings.getNumber(SETTING_KEYS.FOOD_MAX_QUANTITY_PER_ITEM);
    const maxItems = await this.settings.getNumber(SETTING_KEYS.FOOD_MAX_ITEMS_PER_ORDER);

    if (dto.quantity > maxQuantity) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `You can order at most ${maxQuantity} of any one item.`,
      );
    }

    const item = await this.prisma.menuItem.findFirst({
      where: { id: dto.menuItemId, deletedAt: null },
      select: {
        id: true,
        name: true,
        price: true,
        currency: true,
        available: true,
        restaurantId: true,
      },
    });

    if (!item) throw DomainError.notFound('Menu item');

    if (!item.available) {
      throw new DomainError(
        DomainErrorCode.MENU_ITEM_UNAVAILABLE,
        `${item.name} is not available at the moment.`,
      );
    }

    await this.restaurants.assertOrderable(item.restaurantId);

    return this.prisma.$transaction(async (tx) => {
      const cart = await this.openCart(tx, userId, item.restaurantId, item.currency);

      const lineCount = await tx.foodOrderItem.count({ where: { orderId: cart.id } });

      const existing = await tx.foodOrderItem.findFirst({
        where: { orderId: cart.id, menuItemId: item.id },
        select: { id: true, quantity: true },
      });

      if (!existing && lineCount >= maxItems) {
        throw new DomainError(
          DomainErrorCode.VALIDATION_FAILED,
          `An order can contain at most ${maxItems} different items.`,
        );
      }

      const quantity = Math.min(maxQuantity, (existing?.quantity ?? 0) + dto.quantity);
      const lineTotal = round2(item.price.times(quantity));

      if (existing) {
        await tx.foodOrderItem.update({
          where: { id: existing.id },
          data: { quantity, unitPrice: item.price, lineTotal, notes: dto.notes },
        });
      } else {
        await tx.foodOrderItem.create({
          data: {
            orderId: cart.id,
            menuItemId: item.id,
            nameSnapshot: item.name,
            unitPrice: item.price,
            quantity,
            lineTotal,
            notes: dto.notes,
          },
        });
      }

      await this.recalculateDraft(tx, cart.id);
      return this.load(tx, cart.id);
    }, FOOD_TRANSACTION_OPTIONS);
  }

  async updateItem(userId: string, cartItemId: string, dto: UpdateCartItemDto) {
    const maxQuantity = await this.settings.getNumber(SETTING_KEYS.FOOD_MAX_QUANTITY_PER_ITEM);

    if (dto.quantity > maxQuantity) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        `You can order at most ${maxQuantity} of any one item.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Scoped by owner and by DRAFT status: a customer cannot edit somebody
      // else's cart, nor an order that has already been sent to the kitchen.
      const line = await tx.foodOrderItem.findFirst({
        where: {
          id: cartItemId,
          order: { userId, status: FoodOrderStatus.DRAFT },
        },
        select: { id: true, orderId: true, unitPrice: true },
      });

      if (!line) throw DomainError.notFound('Cart item');

      if (dto.quantity === 0) {
        await tx.foodOrderItem.delete({ where: { id: line.id } });
      } else {
        await tx.foodOrderItem.update({
          where: { id: line.id },
          data: {
            quantity: dto.quantity,
            lineTotal: round2(line.unitPrice.times(dto.quantity)),
            notes: dto.notes,
          },
        });
      }

      await this.recalculateDraft(tx, line.orderId);
      return this.load(tx, line.orderId);
    }, FOOD_TRANSACTION_OPTIONS);
  }

  async removeItem(userId: string, cartItemId: string) {
    return this.updateItem(userId, cartItemId, { quantity: 0 });
  }

  /** Every open cart the customer has, one per restaurant. */
  async myCarts(userId: string) {
    const carts = await this.prisma.foodOrder.findMany({
      where: { userId, status: FoodOrderStatus.DRAFT },
      orderBy: { updatedAt: 'desc' },
      select: this.cartSelect(),
    });

    return carts.map((cart) => this.present(cart));
  }

  async getCart(userId: string, restaurantId: string) {
    const cart = await this.prisma.foodOrder.findFirst({
      where: { userId, restaurantId, status: FoodOrderStatus.DRAFT },
      select: this.cartSelect(),
    });

    if (!cart) throw DomainError.notFound('Cart');
    return this.present(cart);
  }

  async clearCart(userId: string, restaurantId: string) {
    const result = await this.prisma.foodOrder.deleteMany({
      where: { userId, restaurantId, status: FoodOrderStatus.DRAFT },
    });
    return { cleared: result.count > 0 };
  }

  // ------------------------------------------------------------------ internals

  private async openCart(
    tx: Prisma.TransactionClient,
    userId: string,
    restaurantId: string,
    currency: string,
  ) {
    const existing = await tx.foodOrder.findFirst({
      where: { userId, restaurantId, status: FoodOrderStatus.DRAFT },
      select: { id: true },
    });

    if (existing) return existing;

    return tx.foodOrder.create({
      data: {
        reference: reference(),
        userId,
        restaurantId,
        status: FoodOrderStatus.DRAFT,
        // A draft has no delivery address yet; it is supplied at checkout. The
        // columns are non-null, so a placeholder stands in until then.
        deliveryAddress: '',
        deliveryLatitude: 0,
        deliveryLongitude: 0,
        itemsSubtotal: 0,
        total: 0,
        currency,
      },
      select: { id: true },
    });
  }

  /**
   * Keeps the draft's stored totals in step with its lines.
   *
   * `food_orders_total_reconciles` requires
   * total = subtotal + delivery + service + tax − discount, so a draft carries a
   * consistent total even before fees are known.
   */
  private async recalculateDraft(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const lines = await tx.foodOrderItem.findMany({
      where: { orderId },
      select: { lineTotal: true },
    });

    const subtotal = sum(lines.map((l) => l.lineTotal));

    await tx.foodOrder.update({
      where: { id: orderId },
      data: { itemsSubtotal: subtotal, total: subtotal },
    });
  }

  private cartSelect() {
    return {
      id: true,
      reference: true,
      status: true,
      currency: true,
      itemsSubtotal: true,
      updatedAt: true,
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          isAcceptingOrders: true,
          minOrderAmount: true,
          defaultPrepMinutes: true,
        },
      },
      items: {
        select: {
          id: true,
          menuItemId: true,
          nameSnapshot: true,
          unitPrice: true,
          quantity: true,
          lineTotal: true,
          notes: true,
          menuItem: { select: { available: true, price: true, imageUrl: true } },
        },
      },
    } satisfies Prisma.FoodOrderSelect;
  }

  private async load(tx: Prisma.TransactionClient, orderId: string) {
    const cart = await tx.foodOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: this.cartSelect(),
    });
    return this.present(cart);
  }

  /**
   * Surfaces two things the customer needs to know before checkout: whether a
   * line has since become unavailable, and whether its price has moved. Both are
   * re-checked authoritatively at checkout, but telling the customer here avoids
   * a surprise at the last step.
   */
  private present(cart: Prisma.FoodOrderGetPayload<{ select: ReturnType<CartService['cartSelect']> }>) {
    const items = cart.items.map((item) => {
      const currentPrice = item.menuItem?.price ?? item.unitPrice;
      return {
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.nameSnapshot,
        imageUrl: item.menuItem?.imageUrl ?? null,
        unitPrice: item.unitPrice.toFixed(2),
        quantity: item.quantity,
        lineTotal: item.lineTotal.toFixed(2),
        notes: item.notes,
        available: item.menuItem?.available ?? false,
        priceChanged: !currentPrice.equals(item.unitPrice),
        currentPrice: currentPrice.toFixed(2),
      };
    });

    const subtotal = cart.itemsSubtotal;
    const minimum = cart.restaurant.minOrderAmount;

    return {
      cartId: cart.id,
      reference: cart.reference,
      currency: cart.currency,
      restaurant: {
        id: cart.restaurant.id,
        name: cart.restaurant.name,
        slug: cart.restaurant.slug,
        logoUrl: cart.restaurant.logoUrl,
        isAcceptingOrders: cart.restaurant.isAcceptingOrders,
        prepMinutes: cart.restaurant.defaultPrepMinutes,
      },
      items,
      itemsSubtotal: subtotal.toFixed(2),
      minimumOrderAmount: minimum.toFixed(2),
      meetsMinimum: subtotal.greaterThanOrEqualTo(minimum),
      hasUnavailableItems: items.some((i) => !i.available),
      hasPriceChanges: items.some((i) => i.priceChanged),
      updatedAt: cart.updatedAt,
    };
  }
}

/** Human-facing order reference, e.g. FD-7K2QX9. */
function reference(): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `FD-${suffix}`;
}

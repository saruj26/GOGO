import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NOTIFICATION_TYPES } from './notification.events';
import { REALTIME_EVENTS, RealtimeEvent } from '../realtime/realtime.events';
import { RealtimeService } from '../realtime/realtime.service';
import { PUSH_PROVIDER, PushProvider } from './push/push.types';

/**
 * Delivery, as distinct from recording.
 *
 * `NotificationsService` writes the row — that is the durable, deduplicated
 * record. This takes that row and tries to get it in front of the person, over
 * two transports with very different properties:
 *
 *   - **The realtime socket** reaches an app that is open, immediately, and is
 *     always available because it is our own.
 *   - **Push** reaches an app that is closed, and only exists when a vendor is
 *     configured.
 *
 * Neither is allowed to fail the operation that raised the notification.
 */
/**
 * Which recorded notifications also warrant an event on the resource's channel.
 *
 * Only lifecycle changes. A promotion or an account notice belongs to the
 * person, not to an order, and has no resource room to go to.
 */
const RESOURCE_EVENTS: Record<string, RealtimeEvent> = {
  [NOTIFICATION_TYPES.FOOD_ORDER_ACCEPTED]: REALTIME_EVENTS.FOOD_ORDER_ACCEPTED,
  [NOTIFICATION_TYPES.FOOD_ORDER_PREPARING]: REALTIME_EVENTS.FOOD_ORDER_PREPARING,
  [NOTIFICATION_TYPES.FOOD_ORDER_READY]: REALTIME_EVENTS.FOOD_ORDER_READY,
  [NOTIFICATION_TYPES.FOOD_ORDER_COURIER_ASSIGNED]:
    REALTIME_EVENTS.FOOD_ORDER_COURIER_ASSIGNED,
  [NOTIFICATION_TYPES.FOOD_ORDER_PICKED_UP]: REALTIME_EVENTS.FOOD_ORDER_PICKED_UP,
  [NOTIFICATION_TYPES.FOOD_ORDER_DELIVERING]: REALTIME_EVENTS.FOOD_ORDER_DELIVERING,
  [NOTIFICATION_TYPES.FOOD_ORDER_DELIVERED]: REALTIME_EVENTS.FOOD_ORDER_DELIVERED,
  [NOTIFICATION_TYPES.FOOD_ORDER_CANCELLED]: REALTIME_EVENTS.FOOD_ORDER_CANCELLED,

  [NOTIFICATION_TYPES.PARCEL_COURIER_ASSIGNED]: REALTIME_EVENTS.PARCEL_COURIER_ASSIGNED,
  [NOTIFICATION_TYPES.PARCEL_PICKED_UP]: REALTIME_EVENTS.PARCEL_PICKED_UP,
  [NOTIFICATION_TYPES.PARCEL_IN_TRANSIT]: REALTIME_EVENTS.PARCEL_IN_TRANSIT,
  [NOTIFICATION_TYPES.PARCEL_DELIVERED]: REALTIME_EVENTS.PARCEL_DELIVERED,
  [NOTIFICATION_TYPES.PARCEL_CANCELLED]: REALTIME_EVENTS.PARCEL_CANCELLED,
};

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
  ) {}

  get pushIsConfigured(): boolean {
    return this.push.isConfigured;
  }

  /**
   * Delivers one recorded notification.
   *
   * `sentAt` is set only when a transport actually accepted it, so an unsent
   * row is a truthful record that the person was never reached — which is what
   * a later retry worker would look for.
   */
  async deliver(notificationId: string): Promise<void> {
    try {
      const notification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
        select: {
          id: true,
          userId: true,
          type: true,
          title: true,
          body: true,
          data: true,
          dedupeKey: true,
          sentAt: true,
        },
      });

      if (!notification || notification.sentAt) return;

      // In-app, over the socket the person is already authenticated on.
      this.realtime.toUser(notification.userId, REALTIME_EVENTS.NOTIFICATION_CREATED, {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
      });

      this.announceToResource(notification.type, notification.data);

      if (!this.push.isConfigured) return;

      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId: notification.userId, active: true },
        select: { token: true },
      });

      if (tokens.length === 0) return;

      const result = await this.push.send({
        tokens: tokens.map((t) => t.token),
        title: notification.title,
        body: notification.body,
        // Push payloads carry identifiers only. The body is already the
        // human-readable part; nothing else about the person travels through a
        // third party.
        data: {
          notificationId: notification.id,
          type: notification.type,
        },
        collapseKey: notification.dedupeKey ?? undefined,
      });

      if (result.invalidTokens.length > 0) {
        await this.prisma.deviceToken.updateMany({
          where: { token: { in: result.invalidTokens } },
          data: { active: false },
        });
      }

      if (result.delivered > 0) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { sentAt: new Date() },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Delivery failed for notification ${notificationId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Also announces the change on the resource's own channel.
   *
   * Every food and parcel lifecycle step already raises a notification that
   * names the order or parcel it is about, so the realtime event can be derived
   * from that rather than adding an emit call to each of the eleven places the
   * two services change state. One mapping in one file, and the verified food
   * and parcel services are left alone.
   *
   * The room is derived from the notification's own data, which the server
   * wrote — never from anything a client supplied — and the room's own
   * authorisation still decides who is listening.
   */
  private announceToResource(type: string, data: unknown): void {
    if (!data || typeof data !== 'object') return;

    const event = RESOURCE_EVENTS[type];
    if (!event) return;

    const payload = data as { orderId?: unknown; parcelId?: unknown };

    if (typeof payload.orderId === 'string') {
      this.realtime.toFoodOrder(payload.orderId, event);
      return;
    }

    if (typeof payload.parcelId === 'string') {
      this.realtime.toParcel(payload.parcelId, event);
    }
  }

  // ------------------------------------------------------------- devices

  /**
   * Registers a device for push.
   *
   * A token is globally unique and can move between accounts — the same handset
   * signed into a different account — so registering re-points an existing
   * token rather than creating a duplicate.
   */
  async registerDevice(userId: string, platform: string, token: string) {
    const device = await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, platform, token, active: true },
      update: { userId, platform, active: true },
      select: { id: true, platform: true, active: true },
    });

    return { ...device, pushConfigured: this.push.isConfigured };
  }

  /** Signing out on a device should stop that device buzzing. */
  async unregisterDevice(userId: string, token: string) {
    await this.prisma.deviceToken.updateMany({
      where: { token, userId },
      data: { active: false },
    });

    return { unregistered: true };
  }
}

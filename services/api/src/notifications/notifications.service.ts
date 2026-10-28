import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, Prisma } from '@prisma/client';
import { CursorPaginationDto, buildCursorPage } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationType } from './notification.events';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel?: NotificationChannel;
  /**
   * Idempotency key, scoped to the recipient. Derive it from the event, not the
   * request — e.g. `food.order.accepted:<orderId>` — so a retry, a duplicate
   * webhook or a repeated button press produces one notification, not several.
   */
  dedupeKey?: string;
}

/**
 * In-app notification persistence.
 *
 * Push, SMS and email transports are not implemented in this phase: rows are
 * written with the channel they are intended for, and a transport worker can
 * later pick up unsent rows. That is recorded as a limitation rather than
 * papered over with a mock that pretends to deliver.
 *
 * Notification writes must never fail the operation they describe. A customer's
 * order is not rolled back because a notification row would not insert.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Injected lazily via a forward reference at module level would couple the
    // two; instead the dispatcher is optional here so a notification can still
    // be recorded in contexts that do not deliver.
    private readonly dispatch: NotificationDispatchService,
  ) {}

  /**
   * @param tx pass the surrounding transaction when the notification must not
   *   outlive a rolled-back operation. Omit it to notify after commit.
   */
  async notify(input: NotifyInput, tx?: Prisma.TransactionClient): Promise<boolean> {
    const client = tx ?? this.prisma;

    try {
      const result = await client.notification.createMany({
        data: {
          userId: input.userId,
          channel: input.channel ?? NotificationChannel.IN_APP,
          type: input.type,
          title: input.title,
          body: input.body,
          data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
          dedupeKey: input.dedupeKey,
        },
        // `notifications_dedupe_key_per_user` turns a repeat into a no-op
        // rather than an error, which is exactly the semantics wanted here.
        skipDuplicates: true,
      });

      if (result.count === 0) return false;

      // Delivery is attempted only for a row that was actually inserted, so a
      // deduplicated repeat never buzzes a phone a second time.
      //
      // When the caller passed a transaction, delivery is deliberately not
      // attempted here: the row may still be rolled back. Those callers are
      // announcing after commit through their own realtime emit.
      if (!tx) {
        const written = await this.prisma.notification.findFirst({
          where: {
            userId: input.userId,
            type: input.type,
            ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });

        if (written) void this.dispatch.deliver(written.id);
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to record notification ${input.type} for user ${input.userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return false;
    }
  }

  /** Notifies several recipients of one event, each with their own dedupe key. */
  async notifyMany(inputs: readonly NotifyInput[], tx?: Prisma.TransactionClient): Promise<number> {
    let delivered = 0;
    for (const input of inputs) {
      if (await this.notify(input, tx)) delivered += 1;
    }
    return delivered;
  }

  async list(userId: string, pagination: CursorPaginationDto, unreadOnly = false) {
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        readAt: true,
        createdAt: true,
      },
    });

    return buildCursorPage(rows, pagination.limit);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Scoped by userId so one user cannot mark another's notification read. */
  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}

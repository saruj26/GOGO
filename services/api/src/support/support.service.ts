import { Injectable } from '@nestjs/common';
import { Prisma, RoleCode, SupportTicketStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CursorPaginationDto, buildCursorPage } from '../common/dto/pagination.dto';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { NOTIFICATION_TYPES } from '../notifications/notification.events';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RidesRepository } from '../rides/rides.repository';
import {
  AddTicketMessageDto,
  AdminTicketListDto,
  AdminTicketReplyDto,
  CreateTicketDto,
} from './dto/support.dto';
import { assertTicketTransition, statusAfterCustomerReply } from './support.state';

// A dozen round trips to a managed database in another region routinely
// exceed Prisma's 5-second default; see rides.service.ts's TRANSACTION_OPTIONS.
const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

/**
 * Support tickets.
 *
 * Two audiences with very different rights share one store: a customer sees
 * their own tickets and the replies written for them, and staff see everything
 * including internal notes. Every read path here filters by that distinction
 * rather than relying on the caller to ask nicely.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ------------------------------------------------------------- customer

  async createTicket(userId: string, dto: CreateTicketDto) {
    // A reference to something the customer does not own would let them attach
    // their complaint to a stranger's ride, and would leak that it exists.
    if (dto.referenceType && dto.referenceId) {
      await this.assertOwnsReference(userId, dto.referenceType, dto.referenceId);
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          reference: RidesRepository.reference('SP'),
          userId,
          subject: dto.subject,
          category: dto.category,
          status: SupportTicketStatus.OPEN,
          referenceType: dto.referenceType ?? null,
          referenceId: dto.referenceId ?? null,
        },
        select: { id: true, reference: true, status: true, createdAt: true },
      });

      // The description is the first message rather than a separate column, so
      // the whole conversation reads in one place and in order.
      await tx.supportMessage.create({
        data: { ticketId: created.id, authorUserId: userId, body: dto.description },
      });

      await this.audit.record(
        {
          actorUserId: userId,
          actorRole: RoleCode.USER,
          action: 'support.ticket.create',
          entityType: 'SupportTicket',
          entityId: created.id,
          newState: { category: dto.category, subject: dto.subject },
        },
        tx,
      );

      return created;
    }, TRANSACTION_OPTIONS);

    return ticket;
  }

  async listMyTickets(userId: string, pagination: CursorPaginationDto) {
    const rows = await this.prisma.supportTicket.findMany({
      where: { userId },
      take: pagination.limit + 1,
      ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        subject: true,
        category: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        _count: { select: { messages: { where: { internal: false } } } },
      },
    });

    return buildCursorPage(rows, pagination.limit);
  }

  async getMyTicket(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      select: {
        id: true,
        reference: true,
        subject: true,
        category: true,
        status: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        messages: {
          // Internal notes are staff-only and are filtered in the query, not
          // in the projection, so they cannot leak through a later change.
          where: { internal: false },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            createdAt: true,
            authorUserId: true,
            author: { select: { firstName: true } },
          },
        },
      },
    });

    if (!ticket) throw DomainError.notFound('Ticket');

    return {
      ...ticket,
      messages: ticket.messages.map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        // Who wrote it matters; which agent wrote it does not.
        fromSupport: message.authorUserId !== userId,
        authorFirstName:
          message.authorUserId === userId ? message.author.firstName : 'Support',
      })),
    };
  }

  async addMyMessage(userId: string, ticketId: string, dto: AddTicketMessageDto) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      select: { id: true, status: true },
    });

    if (!ticket) throw DomainError.notFound('Ticket');

    if (ticket.status === SupportTicketStatus.CLOSED) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'That ticket is closed. Please open a new one.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({
        data: { ticketId, authorUserId: userId, body: dto.body, internal: false },
        select: { id: true, createdAt: true },
      });

      const next = statusAfterCustomerReply(ticket.status);
      if (next !== ticket.status) {
        await tx.supportTicket.update({ where: { id: ticketId }, data: { status: next } });
      } else {
        await tx.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
      }

      return { ...message, status: next };
    }, TRANSACTION_OPTIONS);
  }

  async closeMyTicket(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      select: { id: true, status: true },
    });

    if (!ticket) throw DomainError.notFound('Ticket');

    assertTicketTransition(ticket.status, SupportTicketStatus.CLOSED, RoleCode.USER);

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: SupportTicketStatus.CLOSED },
    });

    return { ticketId, status: SupportTicketStatus.CLOSED };
  }

  // ---------------------------------------------------------------- staff

  async listTickets(query: AdminTicketListDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 25)));

    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.assignedToUserId ? { assignedToUserId: query.assignedToUserId } : {}),
      ...(query.q
        ? {
            OR: [
              { reference: { contains: query.q, mode: 'insensitive' } },
              { subject: { contains: query.q, mode: 'insensitive' } },
              { user: { phone: { contains: query.q } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        // Oldest first: a queue nobody has answered should surface, not sink.
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          reference: true,
          subject: true,
          category: true,
          status: true,
          priority: true,
          createdAt: true,
          updatedAt: true,
          assignedToUserId: true,
          user: { select: { id: true, firstName: true, lastName: true, phone: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        reference: true,
        subject: true,
        category: true,
        status: true,
        priority: true,
        referenceType: true,
        referenceId: true,
        assignedToUserId: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        user: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            body: true,
            internal: true,
            createdAt: true,
            authorUserId: true,
            author: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!ticket) throw DomainError.notFound('Ticket');
    return ticket;
  }

  async reply(actorUserId: string, ticketId: string, dto: AdminTicketReplyDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, userId: true, reference: true },
    });

    if (!ticket) throw DomainError.notFound('Ticket');

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({
        data: {
          ticketId,
          authorUserId: actorUserId,
          body: dto.body,
          internal: dto.internal === true,
        },
        select: { id: true, createdAt: true, internal: true },
      });

      // Answering a ticket puts it in progress; a note to a colleague does not
      // change where the ticket stands.
      if (!message.internal && ticket.status === SupportTicketStatus.OPEN) {
        await tx.supportTicket.update({
          where: { id: ticketId },
          data: { status: SupportTicketStatus.IN_PROGRESS },
        });
      }

      if (!message.internal) {
        await this.notifications.notify(
          {
            userId: ticket.userId,
            type: NOTIFICATION_TYPES.SUPPORT_TICKET_REPLIED,
            title: 'Support replied',
            body: `We have replied to your ticket ${ticket.reference}.`,
            data: { ticketId },
            dedupeKey: `support.reply:${message.id}`,
          },
          tx,
        );
      }

      return message;
    }, TRANSACTION_OPTIONS);
  }

  async setStatus(actorUserId: string, ticketId: string, status: SupportTicketStatus) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, userId: true, reference: true },
    });

    if (!ticket) throw DomainError.notFound('Ticket');

    assertTicketTransition(ticket.status, status, RoleCode.ADMIN);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status,
          resolvedAt:
            status === SupportTicketStatus.RESOLVED || status === SupportTicketStatus.CLOSED
              ? new Date()
              : null,
        },
        select: { id: true, status: true, resolvedAt: true },
      });

      await this.audit.record(
        {
          actorUserId,
          actorRole: RoleCode.ADMIN,
          action: 'support.ticket.status',
          entityType: 'SupportTicket',
          entityId: ticketId,
          previousState: { status: ticket.status },
          newState: { status },
        },
        tx,
      );

      if (status === SupportTicketStatus.RESOLVED) {
        await this.notifications.notify(
          {
            userId: ticket.userId,
            type: NOTIFICATION_TYPES.SUPPORT_TICKET_RESOLVED,
            title: 'Ticket resolved',
            body: `Your ticket ${ticket.reference} has been marked resolved.`,
            data: { ticketId },
            dedupeKey: `support.resolved:${ticketId}`,
          },
          tx,
        );
      }

      return updated;
    }, TRANSACTION_OPTIONS);
  }

  async assign(actorUserId: string, ticketId: string, assignedToUserId?: string) {
    const assignee = assignedToUserId ?? actorUserId;

    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, assignedToUserId: true },
    });

    if (!ticket) throw DomainError.notFound('Ticket');

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedToUserId: assignee,
        // Picking a ticket up is the same act as starting work on it.
        status:
          ticket.status === SupportTicketStatus.OPEN
            ? SupportTicketStatus.IN_PROGRESS
            : ticket.status,
      },
      select: { id: true, assignedToUserId: true, status: true },
    });

    await this.audit.record({
      actorUserId,
      actorRole: RoleCode.ADMIN,
      action: 'support.ticket.assign',
      entityType: 'SupportTicket',
      entityId: ticketId,
      previousState: { assignedToUserId: ticket.assignedToUserId },
      newState: { assignedToUserId: assignee },
    });

    return updated;
  }

  // ------------------------------------------------------------ internals

  /**
   * Confirms the customer owns whatever they are complaining about.
   *
   * Without this a ticket becomes an oracle: attach an arbitrary id, and a
   * validation error tells you whether that ride exists.
   */
  private async assertOwnsReference(
    userId: string,
    referenceType: string,
    referenceId: string,
  ): Promise<void> {
    const owns = await (async () => {
      switch (referenceType.toUpperCase()) {
        case 'RIDE':
          return this.prisma.ridePassenger.count({ where: { rideId: referenceId, userId } });
        case 'FOOD_ORDER':
          return this.prisma.foodOrder.count({ where: { id: referenceId, userId } });
        case 'PARCEL':
          return this.prisma.parcelOrder.count({ where: { id: referenceId, userId } });
        default:
          return 1;
      }
    })();

    if (owns === 0) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'We could not find that in your account.',
      );
    }
  }
}

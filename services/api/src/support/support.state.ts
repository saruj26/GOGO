import { RoleCode, SupportTicketStatus } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';

/**
 * The ticket lifecycle.
 *
 * Deliberately small. A ticket is open, someone is working it, it is waiting on
 * the customer, or it is finished. Every extra state is one more thing an agent
 * has to reason about and one more branch that can be wrong.
 */
const ALLOWED: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  [SupportTicketStatus.OPEN]: [
    SupportTicketStatus.IN_PROGRESS,
    SupportTicketStatus.WAITING_ON_USER,
    SupportTicketStatus.RESOLVED,
    SupportTicketStatus.CLOSED,
  ],
  [SupportTicketStatus.IN_PROGRESS]: [
    SupportTicketStatus.WAITING_ON_USER,
    SupportTicketStatus.RESOLVED,
    SupportTicketStatus.CLOSED,
  ],
  [SupportTicketStatus.WAITING_ON_USER]: [
    SupportTicketStatus.IN_PROGRESS,
    SupportTicketStatus.RESOLVED,
    SupportTicketStatus.CLOSED,
  ],
  // Reopening is a real need — a customer replies and says it is not fixed —
  // so RESOLVED is not terminal. CLOSED is.
  [SupportTicketStatus.RESOLVED]: [
    SupportTicketStatus.IN_PROGRESS,
    SupportTicketStatus.CLOSED,
  ],
  [SupportTicketStatus.CLOSED]: [],
};

/** Only staff move a ticket through its lifecycle. */
const STAFF_ONLY = new Set<SupportTicketStatus>([
  SupportTicketStatus.IN_PROGRESS,
  SupportTicketStatus.WAITING_ON_USER,
  SupportTicketStatus.RESOLVED,
]);

export function assertTicketTransition(
  from: SupportTicketStatus,
  to: SupportTicketStatus,
  role: RoleCode,
): void {
  if (from === to) return;

  if (!ALLOWED[from].includes(to)) {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      from === SupportTicketStatus.CLOSED
        ? 'That ticket is closed.'
        : `A ticket cannot go from ${from} to ${to}.`,
    );
  }

  // The platform has no separate support role; support staff are admins.
  const isStaff = role === RoleCode.ADMIN;

  if (STAFF_ONLY.has(to) && !isStaff) {
    throw DomainError.forbidden('Only support staff can set that status.');
  }

  // A customer closing their own ticket is legitimate — they no longer need
  // help. Anything else on their side is not.
  if (!isStaff && to !== SupportTicketStatus.CLOSED) {
    throw DomainError.forbidden('Only support staff can change a ticket’s status.');
  }
}

export function isTicketOpen(status: SupportTicketStatus): boolean {
  return status !== SupportTicketStatus.CLOSED && status !== SupportTicketStatus.RESOLVED;
}

/**
 * A customer replying to a ticket that support had parked pulls it back into
 * the queue, so an answer does not sit unnoticed.
 */
export function statusAfterCustomerReply(current: SupportTicketStatus): SupportTicketStatus {
  if (current === SupportTicketStatus.WAITING_ON_USER) return SupportTicketStatus.IN_PROGRESS;
  if (current === SupportTicketStatus.RESOLVED) return SupportTicketStatus.IN_PROGRESS;
  return current;
}

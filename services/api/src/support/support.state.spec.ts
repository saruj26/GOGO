import { RoleCode, SupportTicketStatus } from '@prisma/client';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { assertTicketTransition, isTicketOpen, statusAfterCustomerReply } from './support.state';

describe('support ticket lifecycle', () => {
  const expectRefused = (
    from: SupportTicketStatus,
    to: SupportTicketStatus,
    role: RoleCode,
    code: DomainErrorCode,
  ) => {
    let thrown: unknown;
    try {
      assertTicketTransition(from, to, role);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainError);
    expect((thrown as DomainError).code).toBe(code);
  };

  describe('the path a ticket normally takes', () => {
    it('runs open → in progress → resolved → closed', () => {
      const path: Array<[SupportTicketStatus, SupportTicketStatus]> = [
        [SupportTicketStatus.OPEN, SupportTicketStatus.IN_PROGRESS],
        [SupportTicketStatus.IN_PROGRESS, SupportTicketStatus.RESOLVED],
        [SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED],
      ];

      for (const [from, to] of path) {
        expect(() => assertTicketTransition(from, to, RoleCode.ADMIN)).not.toThrow();
      }
    });

    it('lets staff park a ticket on the customer and pick it back up', () => {
      expect(() =>
        assertTicketTransition(
          SupportTicketStatus.IN_PROGRESS,
          SupportTicketStatus.WAITING_ON_USER,
          RoleCode.ADMIN,
        ),
      ).not.toThrow();

      expect(() =>
        assertTicketTransition(
          SupportTicketStatus.WAITING_ON_USER,
          SupportTicketStatus.IN_PROGRESS,
          RoleCode.ADMIN,
        ),
      ).not.toThrow();
    });

    it('allows reopening something that was not actually fixed', () => {
      expect(() =>
        assertTicketTransition(
          SupportTicketStatus.RESOLVED,
          SupportTicketStatus.IN_PROGRESS,
          RoleCode.ADMIN,
        ),
      ).not.toThrow();
    });

    it('treats the same status as a no-op rather than an error', () => {
      expect(() =>
        assertTicketTransition(
          SupportTicketStatus.IN_PROGRESS,
          SupportTicketStatus.IN_PROGRESS,
          RoleCode.USER,
        ),
      ).not.toThrow();
    });
  });

  describe('closed is the end', () => {
    it('refuses to move a closed ticket anywhere', () => {
      for (const to of [
        SupportTicketStatus.OPEN,
        SupportTicketStatus.IN_PROGRESS,
        SupportTicketStatus.RESOLVED,
      ]) {
        expectRefused(
          SupportTicketStatus.CLOSED,
          to,
          RoleCode.ADMIN,
          DomainErrorCode.VALIDATION_FAILED,
        );
      }
    });
  });

  describe('who may change what', () => {
    it('lets a customer close their own ticket', () => {
      expect(() =>
        assertTicketTransition(
          SupportTicketStatus.OPEN,
          SupportTicketStatus.CLOSED,
          RoleCode.USER,
        ),
      ).not.toThrow();
    });

    it('refuses a customer marking their own ticket resolved', () => {
      // Otherwise a ticket clears itself out of the queue unanswered.
      expectRefused(
        SupportTicketStatus.OPEN,
        SupportTicketStatus.RESOLVED,
        RoleCode.USER,
        DomainErrorCode.FORBIDDEN,
      );
    });

    it('refuses a customer putting a ticket in progress', () => {
      expectRefused(
        SupportTicketStatus.OPEN,
        SupportTicketStatus.IN_PROGRESS,
        RoleCode.USER,
        DomainErrorCode.FORBIDDEN,
      );
    });

    it('refuses a driver acting as support', () => {
      expectRefused(
        SupportTicketStatus.OPEN,
        SupportTicketStatus.RESOLVED,
        RoleCode.DRIVER,
        DomainErrorCode.FORBIDDEN,
      );
    });
  });

  describe('a customer replying', () => {
    it('pulls a parked ticket back into the queue', () => {
      expect(statusAfterCustomerReply(SupportTicketStatus.WAITING_ON_USER)).toBe(
        SupportTicketStatus.IN_PROGRESS,
      );
    });

    it('reopens one that was marked resolved', () => {
      expect(statusAfterCustomerReply(SupportTicketStatus.RESOLVED)).toBe(
        SupportTicketStatus.IN_PROGRESS,
      );
    });

    it('leaves an open ticket where it is', () => {
      expect(statusAfterCustomerReply(SupportTicketStatus.OPEN)).toBe(SupportTicketStatus.OPEN);
      expect(statusAfterCustomerReply(SupportTicketStatus.IN_PROGRESS)).toBe(
        SupportTicketStatus.IN_PROGRESS,
      );
    });
  });

  describe('what counts as still needing attention', () => {
    it('is anything not resolved or closed', () => {
      expect(isTicketOpen(SupportTicketStatus.OPEN)).toBe(true);
      expect(isTicketOpen(SupportTicketStatus.IN_PROGRESS)).toBe(true);
      expect(isTicketOpen(SupportTicketStatus.WAITING_ON_USER)).toBe(true);
      expect(isTicketOpen(SupportTicketStatus.RESOLVED)).toBe(false);
      expect(isTicketOpen(SupportTicketStatus.CLOSED)).toBe(false);
    });
  });
});

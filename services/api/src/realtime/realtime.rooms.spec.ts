import { DomainError } from '../common/errors/domain.error';
import { authorisationFor, parseRoom, roomFor } from './realtime.rooms';

const RIDE = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER = '9c858901-8a57-4791-81fe-4c455b099bc9';

/**
 * The room name arrives from the client, so this is the boundary where a
 * hostile string either stops or becomes a subscription.
 */
describe('realtime rooms', () => {
  describe('parsing what a client asked for', () => {
    it('accepts the channels the platform actually has', () => {
      expect(parseRoom(`ride:${RIDE}`)).toEqual({ kind: 'ride', id: RIDE });
      expect(parseRoom(`food-order:${RIDE}`)).toEqual({ kind: 'food-order', id: RIDE });
      expect(parseRoom(`parcel:${RIDE}`)).toEqual({ kind: 'parcel', id: RIDE });
      expect(parseRoom(`user:${RIDE}`)).toEqual({ kind: 'user', id: RIDE });
      expect(parseRoom(`driver:${RIDE}`)).toEqual({ kind: 'driver', id: RIDE });
    });

    it('refuses an unknown channel kind', () => {
      expect(() => parseRoom(`admin:${RIDE}`)).toThrow(DomainError);
      expect(() => parseRoom(`payment:${RIDE}`)).toThrow(DomainError);
    });

    it('refuses anything that is not a uuid', () => {
      // A wildcard or an injection attempt must never reach a query.
      expect(() => parseRoom('ride:*')).toThrow(DomainError);
      expect(() => parseRoom("ride:' OR 1=1 --")).toThrow(DomainError);
      expect(() => parseRoom('ride:1')).toThrow(DomainError);
      expect(() => parseRoom(`ride:${RIDE}extra`)).toThrow(DomainError);
    });

    it('refuses malformed input outright', () => {
      expect(() => parseRoom('')).toThrow(DomainError);
      expect(() => parseRoom('ride')).toThrow(DomainError);
      expect(() => parseRoom(`:${RIDE}`)).toThrow(DomainError);
      expect(() => parseRoom('a'.repeat(200))).toThrow(DomainError);
      expect(() => parseRoom(null as unknown as string)).toThrow(DomainError);
    });

    it('builds the same names it parses', () => {
      expect(parseRoom(roomFor.ride(RIDE)).id).toBe(RIDE);
      expect(parseRoom(roomFor.user(RIDE)).kind).toBe('user');
      expect(parseRoom(roomFor.driver(RIDE)).kind).toBe('driver');
    });
  });

  describe('who may listen to what', () => {
    const passenger = { userId: RIDE, driverId: null, isAdmin: false };
    const driver = { userId: OTHER, driverId: RIDE, isAdmin: false };
    const admin = { userId: OTHER, driverId: null, isAdmin: true };

    it('lets someone listen to their own channel', () => {
      expect(authorisationFor({ kind: 'user', id: RIDE }, passenger)).toBe('allow');
    });

    it('refuses someone listening to another person’s channel', () => {
      expect(authorisationFor({ kind: 'user', id: OTHER }, passenger)).toBe('deny');
    });

    it('lets a driver listen to their own driver channel only', () => {
      expect(authorisationFor({ kind: 'driver', id: RIDE }, driver)).toBe('allow');
      expect(authorisationFor({ kind: 'driver', id: OTHER }, driver)).toBe('deny');
    });

    it('refuses a passenger listening on a driver channel', () => {
      expect(authorisationFor({ kind: 'driver', id: RIDE }, passenger)).toBe('deny');
    });

    it('sends every shared resource for a database check', () => {
      // A ride id proves nothing on its own — membership is the question.
      expect(authorisationFor({ kind: 'ride', id: RIDE }, passenger)).toBe('check-membership');
      expect(authorisationFor({ kind: 'ride', id: RIDE }, driver)).toBe('check-membership');
      expect(authorisationFor({ kind: 'food-order', id: RIDE }, passenger)).toBe(
        'check-membership',
      );
      expect(authorisationFor({ kind: 'parcel', id: RIDE }, passenger)).toBe('check-membership');
    });

    it('lets an administrator listen without a membership check', () => {
      expect(authorisationFor({ kind: 'ride', id: RIDE }, admin)).toBe('allow');
      expect(authorisationFor({ kind: 'user', id: RIDE }, admin)).toBe('allow');
    });
  });
});

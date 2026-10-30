export const ACCESS_TOKEN_TYPE = 'access';
export const REFRESH_TOKEN_TYPE = 'refresh';
export const OTP_TICKET_TYPE = 'otp';
export const SIGNUP_TICKET_TYPE = 'signup';

export interface JwtPayload {
  /** User id. */
  sub: string;
  /** Roles held at issue time. Re-checked against the database on each request. */
  roles: string[];
  type: typeof ACCESS_TOKEN_TYPE | typeof REFRESH_TOKEN_TYPE;
  /** Rotating token family id, so one stolen refresh token can be revoked. */
  jti?: string;
}

/**
 * Carries OTP verification state across the request/verify round trip
 * without a database row: the code is never stored, only its hash, signed
 * so a client cannot forge or extend it.
 */
export interface OtpTicketPayload {
  type: typeof OTP_TICKET_TYPE;
  phone: string;
  codeHash: string;
  attempts: number;
}

/**
 * Carries whatever has been verified so far (a phone, and/or a Google
 * identity) between OTP/Google verification and account creation. A signup
 * ticket is only ever honoured if it carries a verified `phone` — no account
 * is created without one, matching the backend's existing phone-required
 * schema.
 */
export interface SignupTicketPayload {
  type: typeof SIGNUP_TICKET_TYPE;
  phone?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

/** The authenticated principal attached to every request. */
export interface AuthenticatedUser {
  id: string;
  roles: string[];
  driverId: string | null;
}

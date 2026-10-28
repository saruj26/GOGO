export const ACCESS_TOKEN_TYPE = 'access';
export const REFRESH_TOKEN_TYPE = 'refresh';

export interface JwtPayload {
  /** User id. */
  sub: string;
  /** Roles held at issue time. Re-checked against the database on each request. */
  roles: string[];
  type: typeof ACCESS_TOKEN_TYPE | typeof REFRESH_TOKEN_TYPE;
  /** Rotating token family id, so one stolen refresh token can be revoked. */
  jti?: string;
}

/** The authenticated principal attached to every request. */
export interface AuthenticatedUser {
  id: string;
  roles: string[];
  driverId: string | null;
}

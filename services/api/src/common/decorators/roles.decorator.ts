import { SetMetadata } from '@nestjs/common';
import { RoleCode } from '@prisma/client';

export const ROLES_KEY = 'required_roles';

/**
 * Restricts a route to the listed roles. Absence of this decorator on a
 * non-public route means "any authenticated user", never "anyone".
 */
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);

export const IS_PUBLIC_KEY = 'is_public';

/** Marks a route as reachable without authentication. Used sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

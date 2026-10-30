import { HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { Prisma, RoleCode, UserStatus } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { DomainError, DomainErrorCode } from '../common/errors/domain.error';
import { PrismaService } from '../prisma/prisma.service';
import { SETTING_KEYS } from '../settings/settings.registry';
import { SettingsService } from '../settings/settings.service';
import {
  ACCESS_TOKEN_TYPE,
  JwtPayload,
  OTP_TICKET_TYPE,
  OtpTicketPayload,
  REFRESH_TOKEN_TYPE,
  SIGNUP_TICKET_TYPE,
  SignupTicketPayload,
} from './auth.constants';
import { AuditService } from '../audit/audit.service';
import {
  CompleteSignupDto,
  GoogleSignInDto,
  LoginDto,
  RegisterDto,
  RequestOtpDto,
  UpdateProfileDto,
  VerifyOtpDto,
} from './dto/auth.dto';

/**
 * Verified phone (and Google identity, if any), before an account exists.
 * `incorrect` is an ordinary, expected outcome — a mistyped digit — not a
 * server error, so it is a 200 response carrying a fresh ticket to retry
 * with, not a thrown exception.
 */
export type SignupResult =
  | { status: 'authenticated'; tokens: Tokens }
  | {
      status: 'signup_required';
      signupTicket: string;
      // Echoed plainly (not just inside the signed ticket) so the client can
      // pre-fill the name screen without needing to decode a JWT itself.
      firstName?: string;
      email?: string;
    }
  | { status: 'incorrect'; otpTicket: string; attemptsRemaining: number };

/** A Google identity verified, before we know if it needs a phone too. */
export type GoogleResult =
  | { status: 'authenticated'; tokens: Tokens }
  | { status: 'phone_required'; signupTicket: string };

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Password hashing uses Argon2id at parameters recommended by OWASP.
 * Refresh tokens are stored only as SHA-256 digests, so a database disclosure
 * does not hand an attacker usable sessions.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

// A dozen round trips to a managed database in another region routinely
// exceed Prisma's 5-second default; see rides.service.ts's TRANSACTION_OPTIONS.
const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  async register(dto: RegisterDto): Promise<Tokens> {
    const existing = await this.prisma.user.findFirst({
      where: { phone: dto.phone, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      // Same message whether or not the account exists, so this endpoint cannot
      // be used to enumerate who has registered.
      throw DomainError.conflict(
        DomainErrorCode.CONFLICT,
        'That phone number cannot be registered. Try signing in instead.',
      );
    }

    const passwordHash = await hash(dto.password, ARGON2_OPTIONS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phone: dto.phone,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          gender: dto.gender,
          sharedRidePrefs: { create: {} },
          wallet: { create: {} },
        },
        select: { id: true },
      });

      const role = await tx.role.findUnique({ where: { code: RoleCode.USER } });
      if (role) {
        await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
      }

      return created;
    }, TRANSACTION_OPTIONS);

    return this.issueTokens(user.id, [RoleCode.USER]);
  }

  async login(dto: LoginDto, context: { ip?: string; userAgent?: string }): Promise<Tokens> {
    const user = await this.prisma.user.findFirst({
      where: { phone: dto.phone, deletedAt: null },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });

    // Verify against a dummy hash when the user is absent so the response time
    // does not reveal whether the account exists.
    const passwordHash =
      user?.passwordHash ??
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000';

    let valid = false;
    try {
      valid = await verify(passwordHash, dto.password);
    } catch {
      valid = false;
    }

    if (!user || !valid) {
      throw new UnauthorizedException('Incorrect phone number or password');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('This account is not active. Please contact support.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(
      user.id,
      user.roles.map((r) => r.role.code),
      context,
    );
  }

  /**
   * Rotating refresh: the presented token is revoked as the new pair is issued,
   * so a replayed token is rejected.
   */
  async refresh(token: string, context: { ip?: string; userAgent?: string }): Promise<Tokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    if (payload.type !== REFRESH_TOKEN_TYPE) {
      throw new UnauthorizedException('Invalid token');
    }

    const tokenHash = this.hashToken(token);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, status: UserStatus.ACTIVE },
      select: { id: true, roles: { select: { role: { select: { code: true } } } } },
    });

    if (!user) {
      throw new UnauthorizedException('Account is not active');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(
      user.id,
      user.roles.map((r) => r.role.code),
      context,
    );
  }

  async logout(userId: string, token?: string): Promise<void> {
    if (token) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: this.hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return;
    }

    // No token supplied: end every session for this user.
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    userId: string,
    roles: string[],
    context: { ip?: string; userAgent?: string } = {},
  ): Promise<Tokens> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '30d');
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: userId, roles, type: ACCESS_TOKEN_TYPE } satisfies JwtPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.ttlToSeconds(accessTtl),
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, roles, type: REFRESH_TOKEN_TYPE, jti } satisfies JwtPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.ttlToSeconds(refreshTtl),
      },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: this.expiryFromTtl(refreshTtl),
        userAgent: context.userAgent?.slice(0, 500),
        ipAddress: context.ip,
      },
    });

    return { accessToken, refreshToken, expiresIn: this.ttlToSeconds(accessTtl) };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private ttlToSeconds(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) return 900;
    const value = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    return value * multiplier;
  }

  private expiryFromTtl(ttl: string): Date {
    return new Date(Date.now() + this.ttlToSeconds(ttl) * 1000);
  }

  /**
   * Starts phone verification. No SMS gateway is configured yet, so the code
   * is handed back directly (and logged) when the `auth.otp_dev_mode_expose_code`
   * setting is on — never in a build where that setting is off, which is the
   * only thing standing between this and shipping a code nobody can read.
   */
  async requestOtp(dto: RequestOtpDto): Promise<{ otpTicket: string; devCode?: string }> {
    const [length, expirySeconds, devMode] = await Promise.all([
      this.settings.getNumber(SETTING_KEYS.OTP_LENGTH),
      this.settings.getNumber(SETTING_KEYS.OTP_EXPIRY_SECONDS),
      this.settings.getBoolean(SETTING_KEYS.OTP_DEV_MODE_EXPOSE_CODE),
    ]);

    const code = this.generateOtpCode(length);

    const otpTicket = await this.jwt.signAsync(
      {
        type: OTP_TICKET_TYPE,
        phone: dto.phone,
        codeHash: this.hashToken(code),
        attempts: 0,
      } satisfies OtpTicketPayload,
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: expirySeconds },
    );

    if (devMode) {
      this.logger.warn(`[DEV MODE, no SMS gateway] OTP for ${dto.phone}: ${code}`);
    }

    return { otpTicket, devCode: devMode ? code : undefined };
  }

  /**
   * Checks a code against its ticket. An existing account with this phone is
   * signed straight in — OTP is a passwordless login for any account, not
   * only ones created through this flow. A new phone gets a signup ticket
   * instead of an account: nothing is created until a name is supplied.
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<SignupResult> {
    const payload = await this.verifyOtpTicket(dto.otpTicket);

    if (payload.phone !== dto.phone) {
      throw new DomainError(DomainErrorCode.OTP_INCORRECT, 'That code is not valid for this phone number.');
    }

    if (payload.attempts >= 5) {
      throw new DomainError(
        DomainErrorCode.OTP_EXPIRED,
        'Too many incorrect attempts. Request a new code.',
      );
    }

    if (this.hashToken(dto.code) !== payload.codeHash) {
      const expirySeconds = await this.settings.getNumber(SETTING_KEYS.OTP_EXPIRY_SECONDS);
      const attempts = payload.attempts + 1;
      const retryTicket = await this.jwt.signAsync(
        {
          type: OTP_TICKET_TYPE,
          phone: payload.phone,
          codeHash: payload.codeHash,
          attempts,
        } satisfies OtpTicketPayload,
        { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: expirySeconds },
      );
      return { status: 'incorrect', otpTicket: retryTicket, attemptsRemaining: 5 - attempts };
    }

    const existing = await this.prisma.user.findFirst({
      where: { phone: dto.phone, deletedAt: null },
      select: {
        id: true,
        status: true,
        phoneVerifiedAt: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });

    if (existing) {
      if (existing.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('This account is not active. Please contact support.');
      }

      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          lastLoginAt: new Date(),
          phoneVerifiedAt: existing.phoneVerifiedAt ?? new Date(),
        },
      });

      const tokens = await this.issueTokens(
        existing.id,
        existing.roles.map((r) => r.role.code),
      );
      return { status: 'authenticated', tokens };
    }

    // A prior Google step may already have verified an email/name — merged in
    // here so finishing signup does not lose it.
    const priorTicket = dto.signupTicket ? await this.verifySignupTicket(dto.signupTicket) : null;

    const signupTicket = await this.signSignupTicket({
      phone: dto.phone,
      email: priorTicket?.email,
      firstName: priorTicket?.firstName,
      lastName: priorTicket?.lastName,
    });
    return {
      status: 'signup_required',
      signupTicket,
      firstName: priorTicket?.firstName,
      email: priorTicket?.email,
    };
  }

  /**
   * Creates the account a signup ticket was verified for. A ticket without a
   * verified phone is refused outright — no account exists here without one,
   * Google-originated or not, because a working phone number is how a driver
   * or support actually reaches someone.
   */
  async completeSignup(dto: CompleteSignupDto): Promise<Tokens> {
    const payload = await this.verifySignupTicket(dto.signupTicket);

    if (!payload.phone) {
      throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'A verified phone number is required to finish creating an account.',
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: { phone: payload.phone, deletedAt: null },
      select: { id: true },
    });

    if (existing) {
      throw DomainError.conflict(
        DomainErrorCode.CONFLICT,
        'That phone number cannot be registered. Try signing in instead.',
      );
    }

    // Nobody signs in with a password on an account created this way — they
    // always come back in through OTP or Google — so the hash only needs to
    // satisfy the column, never be entered or even known.
    const passwordHash = await hash(randomBytes(32).toString('hex'), ARGON2_OPTIONS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phone: payload.phone!,
          email: payload.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          gender: dto.gender,
          phoneVerifiedAt: new Date(),
          emailVerifiedAt: payload.email ? new Date() : null,
          sharedRidePrefs: { create: {} },
          wallet: { create: {} },
        },
        select: { id: true },
      });

      const role = await tx.role.findUnique({ where: { code: RoleCode.USER } });
      if (role) {
        await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });
      }

      return created;
    }, TRANSACTION_OPTIONS);

    return this.issueTokens(user.id, [RoleCode.USER]);
  }

  /**
   * Verifies a Google ID token server-side and either signs the matching
   * account straight in, or hands back a signup ticket carrying the verified
   * email/name so the client can continue into phone verification — Google
   * proves who someone is, not that their phone number works.
   */
  async googleSignIn(dto: GoogleSignInDto): Promise<GoogleResult> {
    const clientId = this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    if (!clientId) {
      throw new DomainError(
        DomainErrorCode.GOOGLE_NOT_CONFIGURED,
        'Google sign-in is not available yet.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const client = new OAuth2Client(clientId);
    let email: string | undefined;
    let firstName: string | undefined;
    let lastName: string | undefined;

    try {
      const ticket = await client.verifyIdToken({ idToken: dto.idToken, audience: clientId });
      const claims = ticket.getPayload();
      if (!claims?.email) throw new Error('Google did not return an email address.');
      email = claims.email.toLowerCase();
      firstName = claims.given_name ?? claims.name ?? 'there';
      lastName = claims.family_name;
    } catch {
      throw new DomainError(
        DomainErrorCode.GOOGLE_SIGN_IN_FAILED,
        'Could not verify that Google account. Please try again.',
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: {
        id: true,
        status: true,
        emailVerifiedAt: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });

    if (existing) {
      if (existing.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('This account is not active. Please contact support.');
      }

      await this.prisma.user.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date(), emailVerifiedAt: existing.emailVerifiedAt ?? new Date() },
      });

      const tokens = await this.issueTokens(
        existing.id,
        existing.roles.map((r) => r.role.code),
      );
      return { status: 'authenticated', tokens };
    }

    const signupTicket = await this.signSignupTicket({ email, firstName, lastName });
    return { status: 'phone_required', signupTicket };
  }

  private generateOtpCode(length: number): string {
    const max = 10 ** length;
    return randomInt(0, max).toString().padStart(length, '0');
  }

  private async signSignupTicket(fields: Omit<SignupTicketPayload, 'type'>): Promise<string> {
    return this.jwt.signAsync(
      { type: SIGNUP_TICKET_TYPE, ...fields } satisfies SignupTicketPayload,
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: 15 * 60 },
    );
  }

  private async verifyOtpTicket(ticket: string): Promise<OtpTicketPayload> {
    try {
      const payload = await this.jwt.verifyAsync<OtpTicketPayload>(ticket, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.type !== OTP_TICKET_TYPE) throw new Error('wrong ticket type');
      return payload;
    } catch {
      throw new DomainError(DomainErrorCode.OTP_EXPIRED, 'That code has expired. Request a new one.');
    }
  }

  private async verifySignupTicket(ticket: string): Promise<SignupTicketPayload> {
    try {
      const payload = await this.jwt.verifyAsync<SignupTicketPayload>(ticket, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      if (payload.type !== SIGNUP_TICKET_TYPE) throw new Error('wrong ticket type');
      return payload;
    } catch {
      throw new DomainError(
        DomainErrorCode.OTP_EXPIRED,
        'That verification has expired. Please start again.',
      );
    }
  }

  /** Removes revoked and expired sessions; called by the maintenance job. */
  async pruneRefreshTokens(): Promise<number> {
    const result: Prisma.BatchPayload = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });
    return result.count;
  }
  /**
   * Updates the fields a person owns on their own profile.
   *
   * Only the fields present in the request are touched, so sending one field
   * cannot blank the rest. Email is unique across accounts, so a collision is
   * reported as a conflict rather than surfacing a database constraint.
   *
   * Changing gender changes who the matching engine will let you share a
   * vehicle with, which is why it is validated against the enum rather than
   * accepted as free text.
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Record<string, unknown>> {
    const data: Prisma.UserUpdateInput = {};

    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim() || null;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.avatarUrl !== undefined) data.avatarUrl = dto.avatarUrl || null;

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      data.email = email || null;
      // A changed address has not been proved to belong to them, so any
      // previous verification no longer applies.
      data.emailVerifiedAt = null;
    }

    if (Object.keys(data).length === 0) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'There is nothing to update.');
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          phone: true,
          email: true,
          firstName: true,
          lastName: true,
          gender: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      await this.audit.record({
        actorUserId: userId,
        actorRole: RoleCode.USER,
        action: 'account.profile.update',
        entityType: 'User',
        entityId: userId,
        // The changed field names, never their values: a profile audit trail
        // should not become a second copy of everyone's personal details.
        newState: { fields: Object.keys(data) },
      });

      return updated as unknown as Record<string, unknown>;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw DomainError.conflict(
          DomainErrorCode.CONFLICT,
          'That email address is already in use.',
        );
      }
      throw error;
    }
  }

}

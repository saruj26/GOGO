import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth.constants';
import { AuthService, GoogleResult, SignupResult } from './auth.service';
import {
  AuthTokensDto,
  CompleteSignupDto,
  GoogleSignInDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  RequestOtpDto,
  UpdateSafetyPreferencesDto,
  UpdateProfileDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  // Credential endpoints are rate limited harder than the global default.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Create a customer account' })
  register(@Body() dto: RegisterDto): Promise<AuthTokensDto> {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in' })
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.auth.login(dto, { ip: req.ip, userAgent: req.get('user-agent') ?? undefined });
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new pair' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthTokensDto> {
    return this.auth.refresh(dto.refreshToken, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a phone verification code' })
  requestOtp(@Body() dto: RequestOtpDto): Promise<{ otpTicket: string; devCode?: string }> {
    return this.auth.requestOtp(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a phone code — logs an existing account in directly' })
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<SignupResult> {
    return this.auth.verifyOtp(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register/complete')
  @ApiOperation({ summary: 'Finish creating an account from a verified signup ticket' })
  completeSignup(@Body() dto: CompleteSignupDto): Promise<AuthTokensDto> {
    return this.auth.completeSignup(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in (or start signup) with a Google ID token' })
  googleSignIn(@Body() dto: GoogleSignInDto): Promise<GoogleResult> {
    return this.auth.googleSignIn(dto);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'End the current session, or all sessions' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: Partial<RefreshDto>,
  ): Promise<void> {
    await this.auth.logout(user.id, dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'The signed-in user’s own profile' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        phone: true,
        email: true,
        firstName: true,
        lastName: true,
        gender: true,
        avatarUrl: true,
        createdAt: true,
        sharedRidePrefs: true,
        wallet: { select: { balance: true, currency: true } },
      },
    });

    return { ...profile, roles: user.roles, driverId: user.driverId };
  }

  @ApiBearerAuth()
  @Put('me')
  @ApiOperation({
    summary: 'Update your own profile',
    description:
      'Name, email, gender and avatar. Phone is not editable here: it is the login identifier, and moving an account to an unverified number is not something the account holder can do unilaterally. Role and account status are not editable by anyone but an administrator.',
  })
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @Put('me/safety-preferences')
  @ApiOperation({
    summary: 'Update shared-ride safety preferences',
    description:
      'The gender preference recorded here is applied as a hard constraint by the matching engine and cannot be overridden by a cheaper or closer match.',
  })
  updateSafetyPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSafetyPreferencesDto,
  ) {
    return this.prisma.sharedRidePreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...dto },
      update: dto,
    });
  }
}

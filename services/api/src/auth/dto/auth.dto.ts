import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, SharedRideGenderPreference } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

/** E.164-ish; permissive enough for local formats, strict enough to be a phone. */
const PHONE_PATTERN = /^\+?[0-9]{9,15}$/;

export class RegisterDto {
  @ApiProperty({ example: '+94771234567' })
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'password must be at least 10 characters' })
  @MaxLength(200)
  password!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}

export class LoginDto {
  @ApiProperty({ example: '+94771234567' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class UpdateSafetyPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowSharedRides?: boolean;

  @ApiPropertyOptional({
    enum: SharedRideGenderPreference,
    description:
      'Who you are willing to share a vehicle with. Enforced as a hard matching constraint.',
  })
  @IsOptional()
  @IsEnum(SharedRideGenderPreference)
  genderPreference?: SharedRideGenderPreference;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowFrontSeat?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shareContactWithCoPax?: boolean;
}

export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty() expiresIn!: number;
}

/**
 * The profile fields a person may change themselves.
 *
 * Phone is deliberately absent. It is the login identifier, and changing it
 * without verifying the new number would let an account be moved to a number
 * its owner does not control. It changes through support until an OTP flow
 * exists.
 *
 * Role and account status are absent for the same class of reason: neither is
 * the account holder's to set.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nimal' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Perera' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ example: 'nimal@example.lk' })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @ApiPropertyOptional({
    enum: Gender,
    description: 'Used by shared-ride safety matching, so changing it changes who you can share with.',
  })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'URL of an already-uploaded image.' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  avatarUrl?: string;
}

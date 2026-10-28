import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DriverApprovalStatus,
  FoodOrderStatus,
  ParcelStatus,
  PaymentStatus,
  PromotionType,
  RestaurantStatus,
  RideStatus,
  RideType,
  ServiceType,
  UserStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber,
  IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { OffsetPaginationDto } from '../../common/dto/pagination.dto';

export class AdminListDto extends OffsetPaginationDto {
  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsOptional() @IsString() @MaxLength(120)
  q?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  from?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  to?: string;
}

export class AdminUserListDto extends AdminListDto {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional() @IsEnum(UserStatus)
  status?: UserStatus;
}

export class AdminDriverListDto extends AdminListDto {
  @ApiPropertyOptional({ enum: DriverApprovalStatus })
  @IsOptional() @IsEnum(DriverApprovalStatus)
  approvalStatus?: DriverApprovalStatus;
}

export class AdminRideListDto extends AdminListDto {
  @ApiPropertyOptional({ enum: RideStatus })
  @IsOptional() @IsEnum(RideStatus)
  status?: RideStatus;

  @ApiPropertyOptional({ enum: RideType })
  @IsOptional() @IsEnum(RideType)
  rideType?: RideType;
}

export class AdminFoodOrderListDto extends AdminListDto {
  @ApiPropertyOptional({ enum: FoodOrderStatus })
  @IsOptional() @IsEnum(FoodOrderStatus)
  status?: FoodOrderStatus;
}

export class AdminParcelListDto extends AdminListDto {
  @ApiPropertyOptional({ enum: ParcelStatus })
  @IsOptional() @IsEnum(ParcelStatus)
  status?: ParcelStatus;
}

export class AdminPaymentListDto extends AdminListDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional() @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsOptional() @IsEnum(ServiceType)
  serviceType?: ServiceType;
}

export class AdminAuditLogListDto extends AdminListDto {
  @ApiPropertyOptional({ example: 'ride.complete' })
  @IsOptional() @IsString() @MaxLength(80)
  action?: string;

  @ApiPropertyOptional({ example: 'FoodOrder' })
  @IsOptional() @IsString() @MaxLength(60)
  entityType?: string;
}

export class DriverDecisionDto {
  @ApiPropertyOptional({ description: 'Required when rejecting or suspending' })
  @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class SetUserStatusDto {
  @ApiProperty({ enum: UserStatus }) @IsEnum(UserStatus)
  status!: UserStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

export class SetRestaurantStatusDto {
  @ApiProperty({ enum: RestaurantStatus }) @IsEnum(RestaurantStatus)
  status!: RestaurantStatus;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  reason?: string;
}

/**
 * Every field a pricing rule exposes for editing.
 *
 * Anything absent cannot be changed through the admin API, by construction —
 * notably `version`, `active` and `effectiveTo`, which the platform manages when
 * it supersedes a rule.
 */
export class UpdatePricingRuleDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) baseFare?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) perKmFare?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) perMinuteFare?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minimumFare?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) bookingFee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) waitingPerMinuteFee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) freeWaitingMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) sharedDiscountPct?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) maxPassengerDiscountPct?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) serviceFeePct?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) taxPct?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) cancellationFee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) freeCancellationSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) platformCommissionPct?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) sharedPassengerDriverSharePct?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) additionalStopFee?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minimumDriverEarning?: number;
}

export class CreatePromotionDto {
  @ApiProperty({ example: 'WELCOME20' })
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,30}$/, {
    message: 'code must be 3–30 characters: upper-case letters, digits, hyphen or underscore',
  })
  code!: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(80)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: PromotionType }) @IsEnum(PromotionType)
  type!: PromotionType;

  @ApiProperty({ description: 'A percentage (1–100) or a fixed amount' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  value!: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  maxDiscount?: number;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({ enum: ServiceType, isArray: true, description: 'Empty means every service' })
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true })
  serviceTypes?: ServiceType[];

  @ApiPropertyOptional({ description: 'Total redemptions across all customers' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  perUserLimit?: number;

  @ApiProperty() @IsDateString()
  validFrom!: string;

  @ApiProperty() @IsDateString()
  validTo!: string;
}

export class UpdatePromotionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  validTo?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  usageLimit?: number;

  // `usedCount` is deliberately absent: the redemption counter is maintained by
  // the platform and must never be settable from a client.
}

export class UpdateSettingDto {
  @ApiProperty({ description: 'Validated against the setting’s declared type and bounds' })
  value!: unknown;
}

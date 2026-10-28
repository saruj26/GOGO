import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CancelledBy, RideType, SharedRideGenderPreference } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class LocationDto {
  @ApiProperty({ example: 9.6615 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 80.0255 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @ApiProperty({ example: 'Jaffna Bus Stand' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address!: string;
}

export class EstimateRideDto {
  @ApiProperty({ type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  pickup!: LocationDto;

  @ApiProperty({ type: LocationDto })
  @ValidateNested()
  @Type(() => LocationDto)
  dropoff!: LocationDto;

  @ApiPropertyOptional({ description: 'ISO timestamp for a scheduled ride' })
  @IsOptional()
  @IsDateString()
  scheduledPickupAt?: string;
}

export class CreateRideDto extends EstimateRideDto {
  @ApiProperty({ enum: RideType })
  @IsEnum(RideType)
  rideType!: RideType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vehicleTypeId!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 8, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  seats = 1;

  @ApiPropertyOptional({ description: 'Note for the driver' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({ description: 'Promotion code to apply' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  promotionCode?: string;

  @ApiPropertyOptional({
    enum: SharedRideGenderPreference,
    description:
      'Overrides the saved profile preference for this ride only. Applied as a hard matching constraint.',
  })
  @IsOptional()
  @IsEnum(SharedRideGenderPreference)
  genderPreference?: SharedRideGenderPreference;
}

export class SearchSharedRidesDto extends EstimateRideDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  vehicleTypeId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 4, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  seats = 1;

  @ApiPropertyOptional({ enum: SharedRideGenderPreference })
  @IsOptional()
  @IsEnum(SharedRideGenderPreference)
  genderPreference?: SharedRideGenderPreference;
}

export class JoinSharedRideDto {
  @ApiProperty({ format: 'uuid', description: 'The search this offer came from' })
  @IsUUID()
  requestId!: string;

  @ApiProperty({ format: 'uuid', description: 'The offered ride' })
  @IsUUID()
  rideId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CancelRideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CancelledByDto {
  @ApiProperty({ enum: CancelledBy })
  @IsEnum(CancelledBy)
  cancelledBy!: CancelledBy;
}

export class DeclarePlannedJourneyDto {
  @ApiProperty({ type: LocationDto, description: 'Where the journey starts' })
  @ValidateNested()
  @Type(() => LocationDto)
  origin!: LocationDto;

  @ApiPropertyOptional({
    type: [LocationDto],
    description:
      'Places the journey passes through, in travel order. These define the corridor passengers can be matched against.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => LocationDto)
  waypoints?: LocationDto[];

  @ApiProperty({ type: LocationDto, description: 'Where the journey ends' })
  @ValidateNested()
  @Type(() => LocationDto)
  destination!: LocationDto;

  @ApiPropertyOptional({ description: 'ISO timestamp; omit to start immediately' })
  @IsOptional()
  @IsDateString()
  departureAt?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 8,
    description: 'Seats offered to shared passengers. Defaults to the vehicle’s capacity.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  seatsOffered?: number;
}

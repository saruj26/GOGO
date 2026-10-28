import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DriverPresence } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class DriverLocationPingDto {
  @ApiProperty({ example: 9.6615 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 80.0255 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({ description: 'Degrees clockwise from north' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  headingDeg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  speedKph?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracyM?: number;

  @ApiPropertyOptional({ description: 'Device timestamp; the server clamps it to now if ahead.' })
  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class UpdateAvailabilityDto {
  @ApiPropertyOptional({ enum: DriverPresence })
  @IsOptional()
  @IsEnum(DriverPresence)
  presence?: DriverPresence;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  activeVehicleId?: string;

  @ApiPropertyOptional({ description: 'Accept additional passengers on planned routes' })
  @IsOptional()
  @IsBoolean()
  acceptsShared?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptsFood?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptsParcel?: boolean;
}

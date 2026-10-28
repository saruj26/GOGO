import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CursorPaginationDto } from '../../common/dto/pagination.dto';

const PHONE_PATTERN = /^\+?[0-9]{9,15}$/;

export class ParcelPointDto {
  @ApiProperty({ example: 9.6615 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 80.0255 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @ApiProperty({ example: '42 Hospital Road, Jaffna' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address!: string;

  @ApiProperty({ example: 'Nirmala' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  contactName!: string;

  @ApiProperty({ example: '+94771234567' })
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'contactPhone must be a valid phone number' })
  contactPhone!: string;
}

export class EstimateParcelDto {
  @ApiProperty({ type: ParcelPointDto })
  @ValidateNested()
  @Type(() => ParcelPointDto)
  pickup!: ParcelPointDto;

  @ApiProperty({ type: ParcelPointDto })
  @ValidateNested()
  @Type(() => ParcelPointDto)
  dropoff!: ParcelPointDto;

  @ApiProperty({ format: 'uuid', description: 'Parcel class' })
  @IsUUID()
  parcelTypeId!: string;

  @ApiPropertyOptional({ description: 'Weight in kilograms' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  weightKg?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Preferred vehicle class. Omit to be quoted every class that can carry it.',
  })
  @IsOptional()
  @IsUUID()
  vehicleTypeId?: string;
}

export class CreateParcelDto extends EstimateParcelDto {
  @ApiProperty({ format: 'uuid', description: 'The vehicle class you are booking' })
  @IsUUID()
  declare vehicleTypeId: string;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Declared value, for the platform’s records' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  declaredValue?: number;

  @ApiPropertyOptional({ description: 'Anything the courier should know' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp for a scheduled collection' })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @ApiPropertyOptional({ description: 'Promotion code to apply' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  promotionCode?: string;
}

export class CancelParcelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ParcelHistoryDto extends CursorPaginationDto {}

export class FailParcelDto {
  @ApiProperty({ description: 'Why the parcel could not be delivered' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}

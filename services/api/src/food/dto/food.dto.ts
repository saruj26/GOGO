import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CursorPaginationDto } from '../../common/dto/pagination.dto';

export class DeliveryAddressDto {
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
}

export class AddCartItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  menuItemId!: string;

  @ApiProperty({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity = 1;

  @ApiPropertyOptional({ description: 'Note for the kitchen about this item' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 0, description: 'Zero removes the line' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;
}

export class CheckoutFoodOrderDto {
  @ApiProperty({ type: DeliveryAddressDto })
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress!: DeliveryAddressDto;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ description: 'Instructions for the courier' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryNote?: string;

  @ApiPropertyOptional({ description: 'Promotion code to apply' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  promotionCode?: string;

  // There is deliberately no `total` field. The amount charged is calculated
  // server-side from current menu prices; a client cannot propose one.
}

export class CancelFoodOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class FoodOrderHistoryDto extends CursorPaginationDto {}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupportTicketStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** The things a customer can actually be stuck on. */
export const TICKET_CATEGORIES = [
  'RIDE',
  'SHARED_RIDE',
  'FOOD',
  'PARCEL',
  'PAYMENT',
  'ACCOUNT',
  'SAFETY',
  'OTHER',
] as const;

export class CreateTicketDto {
  @ApiProperty({ example: 'Driver did not arrive' })
  @IsString()
  @MinLength(4)
  @MaxLength(160)
  subject!: string;

  @ApiProperty({ enum: TICKET_CATEGORIES })
  @IsIn(TICKET_CATEGORIES as unknown as string[])
  category!: string;

  @ApiProperty({ description: 'What happened, in the customer’s own words.' })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;

  @ApiPropertyOptional({
    description: 'What the ticket is about, e.g. RIDE, FOOD_ORDER, PARCEL.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  referenceType?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  referenceId?: string;
}

export class AddTicketMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class AdminTicketReplyDto extends AddTicketMessageDto {
  @ApiPropertyOptional({
    description:
      'An internal note is visible only to staff. The customer never sees it, so it must not be used to answer them.',
  })
  @IsOptional()
  internal?: boolean;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: SupportTicketStatus })
  @IsEnum(SupportTicketStatus)
  status!: SupportTicketStatus;
}

export class AssignTicketDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Omit to take the ticket yourself.' })
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;
}

export class AdminTicketListDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @ApiPropertyOptional({ description: 'Matches the reference, subject or the customer’s phone.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  limit?: number;
}

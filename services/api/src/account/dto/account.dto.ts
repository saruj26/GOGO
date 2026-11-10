import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ClaimPromotionDto {
  @ApiProperty({ example: 'WELCOME20' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,30}$/, {
    message: 'code must be 3–30 characters: letters, digits, hyphen or underscore',
  })
  code!: string;
}

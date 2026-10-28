import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({ enum: ['android', 'ios', 'web'] })
  @IsIn(['android', 'ios', 'web'])
  platform!: string;

  @ApiProperty({ description: 'The vendor registration token for this install.' })
  @IsString()
  @MinLength(8)
  @MaxLength(400)
  token!: string;
}

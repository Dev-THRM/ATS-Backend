import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password for verification', example: 'OldPass@123' })
  @IsString()
  @IsNotEmpty({ message: 'Current password is required.' })
  currentPassword!: string;

  @ApiProperty({ description: 'New password (min 6 characters)', example: 'NewPass@2026' })
  @IsString()
  @MinLength(6, { message: 'New password must be at least 6 characters long.' })
  newPassword!: string;
}

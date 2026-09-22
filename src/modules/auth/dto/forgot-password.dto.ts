import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@acme.com', description: 'User account email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: 'acme-corp', description: 'Tenant organization slug if multi-tenant' })
  @IsString()
  @IsOptional()
  organizationSlug?: string;
}

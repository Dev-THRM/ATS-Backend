import { IsString, IsNotEmpty, IsEmail, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ContactInquiryDto {
  @ApiProperty({ description: 'Full name of the contact person', example: 'Priya Sharma' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Work email address', example: 'priya@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Company or organization name', example: 'Acme Technologies' })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiPropertyOptional({ description: 'Phone or WhatsApp number', example: '+91 98765 43210' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Specific hiring requirements or custom integrations', example: 'Need Naukri Resdex sync and 6 recruiter accounts' })
  @IsString()
  @IsOptional()
  message?: string;
}


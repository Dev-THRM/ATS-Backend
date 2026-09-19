import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsArray,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class PublicApplyJobDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  jobTitle?: string;

  @IsString()
  @IsOptional()
  position?: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  jobId?: string;

  @IsString()
  @IsOptional()
  resumeUrl?: string;

  @IsString()
  @IsOptional()
  currentCompany?: string;

  @IsString()
  @IsOptional()
  currentTitle?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  linkedinUrl?: string;

  @IsString()
  @IsOptional()
  portfolioUrl?: string;

  @IsString()
  @IsOptional()
  githubUrl?: string;

  @IsString()
  @IsOptional()
  coverLetter?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  utmSource?: string;

  @IsString()
  @IsOptional()
  utmMedium?: string;

  @IsString()
  @IsOptional()
  utmCampaign?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return value.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    return [];
  })
  @IsArray()
  skills?: string[];
}

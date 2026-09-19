import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsArray,
  IsUrl,
} from 'class-validator';

export class CreateCandidateDto {
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
  jobId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  jobIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  positions?: string[];

  @IsString()
  @IsOptional()
  coverLetter?: string;

  @IsString()
  @IsOptional()
  currentCompany?: string;

  @IsString()
  @IsOptional()
  currentTitle?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[] = [];

  @IsString()
  @IsOptional()
  resumeUrl?: string;

  @IsString()
  @IsOptional()
  portfolioUrl?: string;

  @IsString()
  @IsOptional()
  linkedinUrl?: string;

  @IsString()
  @IsOptional()
  githubUrl?: string;

  @IsString()
  @IsOptional()
  source?: string = 'CAREER_PORTAL';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[] = [];
}

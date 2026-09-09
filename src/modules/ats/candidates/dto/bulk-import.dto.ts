import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImportCandidateRowDto {
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

  @IsOptional()
  skills?: string[] | string;

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
  source?: string;

  @IsString()
  @IsOptional()
  linkedinUrl?: string;

  @IsOptional()
  experienceYears?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

export class BulkImportCsvDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCandidateRowDto)
  candidates: ImportCandidateRowDto[];

  @IsString()
  @IsOptional()
  defaultSource?: string;

  @IsString()
  @IsOptional()
  jobId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

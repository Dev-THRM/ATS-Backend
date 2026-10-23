import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateApplicationStageDto {
  @IsString()
  @IsOptional()
  @Transform(({ obj, value }) => value || obj.toStageId)
  stageId?: string;

  @IsString()
  @IsOptional()
  toStageId?: string;

  @IsString()
  @IsOptional()
  rejectionReason?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsBoolean()
  @IsOptional()
  sendEmail?: boolean;

  @IsString()
  @IsOptional()
  customNotes?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  joiningDate?: string;

  @IsString()
  @IsOptional()
  employmentType?: string; // 'INTERNSHIP' | 'FULL_TIME'

  @IsString()
  @IsOptional()
  offerAcceptanceDate?: string;

  @IsOptional()
  compensation?: any;

  @IsString()
  @IsOptional()
  status?: string;
}


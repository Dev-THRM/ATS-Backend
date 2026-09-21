import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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

  @IsBoolean()
  @IsOptional()
  sendEmail?: boolean;

  @IsString()
  @IsOptional()
  customNotes?: string;

  @IsString()
  @IsOptional()
  joiningDate?: string;
}

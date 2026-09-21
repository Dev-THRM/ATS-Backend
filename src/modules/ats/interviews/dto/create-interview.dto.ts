import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InterviewType, InterviewStatus } from '@prisma/client';

export class CreateInterviewDto {
  @IsString()
  @IsNotEmpty()
  applicationId: string;

  @IsString()
  @IsOptional()
  candidateId?: string;

  @IsString()
  @IsOptional()
  jobId?: string;

  @IsString()
  @IsOptional()
  interviewerId?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(InterviewType)
  @IsOptional()
  type?: InterviewType = InterviewType.SCREENING;

  @IsDateString()
  @IsNotEmpty()
  scheduledAt: string;

  @IsNumber()
  @IsOptional()
  @Min(15)
  @Max(240)
  @Type(() => Number)
  durationMinutes?: number = 45;

  @IsString()
  @IsOptional()
  timezone?: string = 'UTC';

  @IsString()
  @IsOptional()
  meetingLink?: string; // If left empty, automated Google Meet link will be generated

  @IsString()
  @IsOptional()
  locationNotes?: string;
}

import { IsIn, IsOptional, IsString, IsBoolean } from 'class-validator';

export class AiDecisionDto {
  @IsIn(['REJECT', 'KEEP'])
  decision: 'REJECT' | 'KEEP';

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}

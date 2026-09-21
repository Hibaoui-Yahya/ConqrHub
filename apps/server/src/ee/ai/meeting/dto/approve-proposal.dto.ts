import { IsBoolean, IsOptional } from 'class-validator';

export class ApproveProposalDto {
  @IsOptional()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  confirmRisk?: boolean;
}

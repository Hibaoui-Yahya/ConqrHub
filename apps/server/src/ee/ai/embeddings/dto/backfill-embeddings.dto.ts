import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class BackfillEmbeddingsDto {
  @IsUUID()
  workspaceId: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsUUID()
  pageId?: string;

  @IsOptional()
  @IsUUID()
  insightId?: string;

  @IsOptional()
  @IsIn(['page', 'expert_insight'])
  sourceKind?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  dryRun?: boolean;
}

export interface BackfillEmbeddingsResult {
  estimatedPages: number;
  estimatedChunks: number;
  estimatedEmbeddingCalls: number;
  enqueuedJobs: number;
  skippedPages: number;
  warnings: string[];
}

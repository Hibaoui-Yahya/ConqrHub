import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum HealthIssueCategory {
  Outdated = 'outdated',
  MissingOwner = 'missing-owner',
  UnverifiedCritical = 'unverified-critical',
  WeakContent = 'weak-content',
}

export class SpaceHealthDto {
  @IsUUID()
  spaceId: string;
}

export class HealthIssuesQueryDto {
  @IsEnum(HealthIssueCategory)
  category: HealthIssueCategory;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}

export type SignalBreakdown = {
  freshness: number;
  ownership: number;
  verification: number | null;
  contentStrength: number;
};

export type HealthScoreResponse = {
  score: number | null;
  pageCount: number;
  scoredPageCount: number;
  signals: SignalBreakdown;
  insufficientData: boolean;
};

export type SpaceScoreSummary = {
  spaceId: string;
  spaceName: string | null;
  spaceSlug: string;
  isCritical: boolean;
  score: number | null;
  pageCount: number;
  insufficientData: boolean;
};

export type WorkspaceHealthResponse = HealthScoreResponse & {
  spaces: SpaceScoreSummary[];
};

export type HealthIssueItem = {
  pageId: string;
  pageSlugId: string;
  pageTitle: string | null;
  spaceId: string;
  spaceName: string | null;
  spaceSlug: string;
  category: HealthIssueCategory;
  severity: 'low' | 'medium' | 'high';
  detail: string;
};

export type HealthIssuesResponse = {
  items: HealthIssueItem[];
  page: number;
  limit: number;
  hasMore: boolean;
};

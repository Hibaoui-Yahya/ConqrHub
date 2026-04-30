import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ExpertInsightStatus } from '../../../database/types/expert-insights.types';

export class QueryInsightsDto {
  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsEnum(['draft', 'published', 'retired'])
  status?: ExpertInsightStatus;
}

export class PageInsightsDto {
  @IsUUID()
  pageId: string;
}

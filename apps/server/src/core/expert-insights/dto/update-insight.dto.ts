import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ExpertInsightType } from '../../../database/types/expert-insights.types';

export class UpdateInsightDto {
  @IsUUID()
  insightId: string;

  @IsOptional()
  @IsEnum(['warning', 'correction', 'notice', 'recommendation'])
  insightType?: ExpertInsightType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsObject()
  spanAnchor?: Record<string, unknown> | null;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  confidence?: 'low' | 'medium' | 'high';
}

export class InsightIdDto {
  @IsUUID()
  insightId: string;
}

import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  IsObject,
} from 'class-validator';
import { ExpertInsightType } from '../../../database/types/expert-insights.types';

export class CreateInsightDto {
  @IsUUID()
  pageId: string;

  @IsUUID()
  spaceId: string;

  @IsEnum(['warning', 'correction', 'notice', 'recommendation'])
  insightType: ExpertInsightType;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  spanAnchor?: Record<string, unknown>;
}

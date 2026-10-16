import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  INSIGHT_KINDS,
  MAX_INSIGHT_CONTENT_CHARS,
  MAX_INSIGHT_QUESTION_CHARS,
  type InsightKind,
} from '../meeting-insights.util';

/** POST /ai/meeting/:id/insights */
export class SaveInsightDto {
  @IsIn(INSIGHT_KINDS as unknown as string[])
  kind!: InsightKind;

  /** The question asked ("qa" only, required there). */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_INSIGHT_QUESTION_CHARS)
  question?: string;

  /** The answer ("qa") or the analysis ("communication-analysis"), Markdown. */
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_INSIGHT_CONTENT_CHARS)
  content!: string;

  /** Transcript version the insight was produced from, if known. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  transcriptVersion?: number;
}

/** GET /ai/meeting/:id/insights */
export class ListInsightsDto {
  @IsOptional()
  @IsIn(INSIGHT_KINDS as unknown as string[])
  kind?: InsightKind;
}

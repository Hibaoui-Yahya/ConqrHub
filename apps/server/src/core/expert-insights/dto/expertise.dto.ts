import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  ExpertInsightStatus,
  ExpertInsightVoteKind,
} from '../../../database/types/expert-insights.types';

export class SearchInsightsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsEnum(['draft', 'published', 'retired'])
  status?: ExpertInsightStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class VoteInsightDto {
  @IsUUID()
  insightId: string;

  /** null withdraws the vote. */
  @ValidateIf((o) => o.vote !== null)
  @IsIn(['helpful', 'not_helpful'])
  vote: ExpertInsightVoteKind | null;
}

export class InsightVotesDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  insightIds: string[];
}

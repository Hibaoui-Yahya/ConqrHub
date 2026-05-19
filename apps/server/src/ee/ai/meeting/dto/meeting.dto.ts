import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class StartMeetingDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;
}

export class ChunkMetaDto {
  @IsString()
  @IsIn(['mic', 'system'])
  source!: 'mic' | 'system';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  startMs!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60 * 60 * 1000)
  durationMs!: number;
}

export class SaveAiOutputDto {
  @IsString()
  @IsIn(['summary', 'actions', 'decisions'])
  key!: 'summary' | 'actions' | 'decisions';

  @IsString()
  @Length(0, 64_000)
  value!: string;
}

export class ListMeetingsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

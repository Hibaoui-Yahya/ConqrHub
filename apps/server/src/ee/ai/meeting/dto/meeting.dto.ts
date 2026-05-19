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

  @IsInt()
  @Min(0)
  sequence!: number;

  @IsInt()
  @Min(0)
  startMs!: number;

  @IsInt()
  @Min(0)
  @Max(5 * 60 * 1000)
  durationMs!: number;
}

export class ListMeetingsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

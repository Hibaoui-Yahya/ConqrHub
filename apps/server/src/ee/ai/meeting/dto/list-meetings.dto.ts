import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListMeetingsDto {
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

  /** Free text matched against the title and the transcript (unified search). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  /** "mine": only the caller's own meetings. */
  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';

  /** Meeting type(s), comma-separated (e.g. "recruitment-interview,daily-standup"). */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  @Matches(/^[a-z0-9-]+(,[a-z0-9-]+)*$/)
  type?: string;

  /** Status(es), comma-separated; checked against the known statuses. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  @Matches(/^[a-z_]+(,[a-z_]+)*$/)
  status?: string;

  /** Started at or after: ISO date (UTC day) or date-time. */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  /** Started at or before: ISO date (whole UTC day included) or date-time. */
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  /** Meetings created by this member of the company. */
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  /** Archived meetings: hidden by default ("exclude"), "include" or "only". */
  @IsOptional()
  @IsIn(['exclude', 'include', 'only'])
  archived?: 'exclude' | 'include' | 'only';
}

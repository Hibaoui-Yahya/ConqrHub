import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** GET /ai/meeting/:id/linkable-members */
export class LinkableMembersDto {
  /** Part of a name or e-mail. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ReviewSpeakersDto {
  @IsInt()
  baseVersion!: number;

  @IsOptional()
  @IsObject()
  renames?: Record<string, string>;

  @IsOptional()
  @IsArray()
  merges?: [string, string][];

  /** speaker label → member id (null or "" unlinks); members only. */
  @IsOptional()
  @IsObject()
  userLinks?: Record<string, string | null>;

  /** segmentId → speaker label; a label that does not exist yet is created
   *  (this is how a reviewer splits a mis-diarized speaker or adds one). */
  @IsOptional()
  @IsObject()
  reassign?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
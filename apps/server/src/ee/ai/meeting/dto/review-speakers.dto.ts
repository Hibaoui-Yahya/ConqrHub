import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class ReviewSpeakersDto {
  @IsInt()
  baseVersion!: number;

  @IsOptional()
  @IsObject()
  renames?: Record<string, string>;

  @IsOptional()
  @IsArray()
  merges?: [string, string][];

  @IsOptional()
  @IsObject()
  userLinks?: Record<string, string>;

  /** segmentId → speaker label; a label that does not exist yet is created
   *  (this is how a reviewer splits a mis-diarized speaker or adds one). */
  @IsOptional()
  @IsObject()
  reassign?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
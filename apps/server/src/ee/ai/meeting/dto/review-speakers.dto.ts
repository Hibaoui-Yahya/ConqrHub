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

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
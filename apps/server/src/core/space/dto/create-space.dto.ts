import {
  IsAlphanumeric,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** `static:image_1` ... `static:image_29` - Plane's bundled covers served by the client. */
export const STATIC_COVER_KEY_PATTERN = /^static:image_([1-9]|1[0-9]|2[0-9])$/;
import { Transform, TransformFnParams } from 'class-transformer';

export class CreateSpaceDto {
  @MinLength(2)
  @MaxLength(100)
  @IsString()
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @MinLength(2)
  @MaxLength(100)
  @IsAlphanumeric()
  slug: string;

  /**
   * Stock cover selection. Uploaded covers go through
   * POST /attachments/upload-image (type=space-cover) instead.
   */
  @IsOptional()
  @IsString()
  @Matches(STATIC_COVER_KEY_PATTERN)
  coverImage?: string;
}

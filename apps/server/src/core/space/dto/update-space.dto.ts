import { PartialType } from '@nestjs/mapped-types';
import { CreateSpaceDto } from './create-space.dto';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';

export class UpdateSpaceDto extends PartialType(CreateSpaceDto) {
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsBoolean()
  disablePublicSharing: boolean;

  @IsOptional()
  @IsBoolean()
  allowViewerComments: boolean;

  @IsOptional()
  @IsBoolean()
  isCritical: boolean;

  /**
   * Stock cover selection: `static:image_1` … `static:image_29` (Plane's
   * bundled covers, served by the client), or `null` to fall back to the
   * default. Uploaded covers go through POST /attachments/upload-image.
   */
  @IsOptional()
  @ValidateIf((o) => o.coverImage !== null)
  @IsString()
  @Matches(/^static:image_([1-9]|1[0-9]|2[0-9])$/)
  coverImage?: string | null;
}

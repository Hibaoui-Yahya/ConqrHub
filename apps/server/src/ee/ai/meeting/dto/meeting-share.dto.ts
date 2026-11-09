import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_SHARE_TARGETS } from '../meeting-share.util';

/** POST /ai/meeting/:id/shares — the service checks each id. */
export class AddMeetingSharesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SHARE_TARGETS)
  @IsString({ each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SHARE_TARGETS)
  @IsString({ each: true })
  groupIds?: string[];
}

/** GET /ai/meeting/:id/share-targets */
export class ShareTargetsDto {
  /** Part of a name (people: or e-mail, never returned). */
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

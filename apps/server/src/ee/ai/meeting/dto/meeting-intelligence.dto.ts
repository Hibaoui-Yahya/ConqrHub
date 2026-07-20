import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class ProcessMeetingDto {
  @IsOptional()
  @IsString()
  meetingType?: string;

  @IsOptional()
  @IsObject()
  languageConfig?: Record<string, unknown>;
}

export class TranscriptQueryDto {
  @IsOptional()
  @IsString()
  version?: string; // 'latest' | integer string
}

export class SpeakerEditDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseVersion: number;

  @IsOptional()
  @IsObject()
  renames?: Record<string, string>;

  @IsOptional()
  merges?: [string, string][];

  @IsOptional()
  @IsObject()
  userLinks?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class PublishDocumentDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsUUID()
  parentPageId?: string;
}

export class ApproveProposalDto {
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  confirmRisk?: boolean;
}

export class AudioUrlQueryDto {
  @IsOptional()
  @IsIn(['original', 'normalized'])
  target?: 'original' | 'normalized';
}

import { PartialType } from '@nestjs/mapped-types';
import { CreateWorkspaceDto } from './create-workspace.dto';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Company-wide ConqrMeet rules (settings.meet). Until now consent was
 * hard-coded in ConqrMeet and nothing else existed; ConqrMeet reads these
 * through its account profile.
 */
export class MeetSettingsDto {
  @IsOptional()
  @IsBoolean()
  consentRequired?: boolean;

  /** null = keep the audio as long as the meeting exists. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  audioRetentionDays?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  defaultLanguage?: string | null;

  @IsOptional()
  @IsUUID()
  publishSpaceId?: string | null;

  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean;
}

export class UpdateWorkspaceDto extends PartialType(CreateWorkspaceDto) {
  /** settings.general.defaultLocale — interface language of new accounts. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}-[A-Z]{2}$/)
  defaultLocale: string;

  /** settings.general.defaultTimezone — IANA name, e.g. America/Toronto. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$/)
  defaultTimezone: string;

  /** settings.general.mailFromName — sender name of suite e-mails. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  mailFromName: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MeetSettingsDto)
  meetSettings: MeetSettingsDto;

  @IsOptional()
  @IsArray()
  emailDomains: string[];

  @IsOptional()
  @IsBoolean()
  enforceSso: boolean;

  @IsOptional()
  @IsBoolean()
  enforceMfa: boolean;

  @IsOptional()
  @IsBoolean()
  restrictApiToAdmins: boolean;

  @IsOptional()
  @IsBoolean()
  aiSearch: boolean;

  @IsOptional()
  @IsBoolean()
  generativeAi: boolean;

  @IsOptional()
  @IsBoolean()
  disablePublicSharing: boolean;

  @IsOptional()
  @IsBoolean()
  mcpEnabled: boolean;

  @IsOptional()
  @IsBoolean()
  aiChat: boolean;

  @IsOptional()
  @IsBoolean()
  aiStt: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  trashRetentionDays: number;

  @IsOptional()
  @IsBoolean()
  allowMemberTemplates: boolean;
}

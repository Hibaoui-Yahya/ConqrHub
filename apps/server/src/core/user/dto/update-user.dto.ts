import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsIn,
  IsInt,
  Max,
  Min,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateUserDto } from '../../auth/dto/create-user.dto';

/** ConqrPlan's theme keys (packages/constants/src/themes.ts). */
export const THEME_KEYS = [
  'system',
  'light',
  'dark',
  'light-contrast',
  'dark-contrast',
  'custom',
] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class ThemeCustomDto {
  @IsString()
  @Matches(HEX_COLOR)
  primary: string;

  @IsString()
  @Matches(HEX_COLOR)
  background: string;

  @IsBoolean()
  darkPalette: boolean;
}

/**
 * Personal ConqrMeet defaults. They used to live in the Meet browser's
 * localStorage; stored on the account they follow the person everywhere.
 * `null` clears a value (back to "let the AI decide" / the company default).
 */
export class MeetingDefaultsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  defaultMeetingType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  defaultLanguage?: string | null;

  @IsOptional()
  @IsBoolean()
  autoProcess?: boolean;
}

export const NOTIFICATION_SOUNDS = [
  'clair',
  'doux',
  'alerte',
  'discret',
  'aucun',
] as const;

/** Sound per notification category (Paramètres › Mon compte › Notifications). */
export class NotificationSoundCategoriesDto {
  @IsOptional() @IsIn(NOTIFICATION_SOUNDS as unknown as string[]) ready?: string;
  @IsOptional() @IsIn(NOTIFICATION_SOUNDS as unknown as string[]) problem?: string;
  @IsOptional() @IsIn(NOTIFICATION_SOUNDS as unknown as string[]) review?: string;
  @IsOptional() @IsIn(NOTIFICATION_SOUNDS as unknown as string[]) mention?: string;
  @IsOptional() @IsIn(NOTIFICATION_SOUNDS as unknown as string[]) verification?: string;
  @IsOptional() @IsIn(NOTIFICATION_SOUNDS as unknown as string[]) updates?: string;
}

export class NotificationSoundsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(100) volume?: number;
  @IsOptional() @IsBoolean() backgroundOnly?: boolean;
  @IsOptional() @IsBoolean() muteWhileRecording?: boolean;
  @IsOptional() @IsBoolean() doNotDisturb?: boolean;
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationSoundCategoriesDto)
  categories?: NotificationSoundCategoriesDto;
}

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  /** Stored as settings.preferences.notificationSounds (merged key by key). */
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationSoundsDto)
  notificationSounds: NotificationSoundsDto;

  /** Stored as settings.preferences.meetings (merged key by key). */
  @IsOptional()
  @ValidateNested()
  @Type(() => MeetingDefaultsDto)
  meetingDefaults: MeetingDefaultsDto;

  @IsOptional()
  @IsBoolean()
  fullPageWidth: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['read', 'edit'])
  pageEditMode: string;

  /** Theme preference; stored as settings.preferences.theme = { theme, custom? }. */
  @IsOptional()
  @IsString()
  @IsIn(THEME_KEYS as unknown as string[])
  theme: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeCustomDto)
  themeCustom: ThemeCustomDto;

  @IsOptional()
  @IsString()
  locale: string;

  @IsOptional()
  @MinLength(8)
  @MaxLength(70)
  @IsString()
  confirmPassword: string;

  @IsOptional()
  @IsBoolean()
  notificationPageUpdates: boolean;

  @IsOptional()
  @IsBoolean()
  notificationPageUserMention: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentUserMention: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentCreated: boolean;

  @IsOptional()
  @IsBoolean()
  notificationCommentResolved: boolean;
}

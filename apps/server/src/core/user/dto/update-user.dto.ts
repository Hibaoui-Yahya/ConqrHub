import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsIn,
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

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
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

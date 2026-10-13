import { IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { SENSITIVITIES } from '../meeting-template.util';

/** POST /ai/meeting-templates — a draft derived from a built-in or custom template. */
export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  /** Built-in id (base type) or the id of a custom template to copy. */
  @IsString()
  @IsNotEmpty()
  baseId!: string;
}

/** PUT /ai/meeting-templates/:id — the editor's draft. */
export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @IsOptional()
  @IsIn(SENSITIVITIES as unknown as string[])
  sensitivity?: (typeof SENSITIVITIES)[number];

  /** Sanitised by normalizeTemplateSpec(). */
  @IsOptional()
  @IsObject()
  spec?: Record<string, unknown>;
}

export class SetDefaultTemplateDto {
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

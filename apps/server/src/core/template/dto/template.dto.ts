import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

export class ListTemplatesDto extends PaginationOptions {
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class TemplateIdDto {
  @IsUUID()
  templateId: string;
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  /** ProseMirror JSON document. */
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  /** Absent or null: a company-wide template (workspace admins only). */
  @IsOptional()
  @ValidateIf((o) => o.spaceId !== null)
  @IsUUID()
  spaceId?: string | null;
}

export class UpdateTemplateDto extends TemplateIdDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @ValidateIf((o) => o.description !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.icon !== null)
  @IsString()
  @MaxLength(64)
  icon?: string | null;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  /** null moves the template to company-wide scope. */
  @IsOptional()
  @ValidateIf((o) => o.spaceId !== null)
  @IsUUID()
  spaceId?: string | null;
}

export class UseTemplateDto extends TemplateIdDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;
}

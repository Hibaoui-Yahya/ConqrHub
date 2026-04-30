import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

export const PAGE_PERMISSION_ROLES = ['reader', 'writer'] as const;
export type PagePermissionRole = (typeof PAGE_PERMISSION_ROLES)[number];

export class PageRestrictDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class AddPagePermissionDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsIn(PAGE_PERMISSION_ROLES)
  role: PagePermissionRole;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class RemovePagePermissionDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  userIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  groupIds?: string[];
}

export class UpdatePagePermissionRoleDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsIn(PAGE_PERMISSION_ROLES)
  role: PagePermissionRole;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @ValidateIf((o) => !o.userId)
  @IsUUID()
  groupId?: string;
}

export class PagePermissionsListDto extends PaginationOptions {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

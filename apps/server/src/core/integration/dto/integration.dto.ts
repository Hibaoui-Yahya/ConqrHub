import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RelationType } from '../domain/relationship-types';

export class CreateRelationshipDto {
  @IsString()
  sourceUrn: string;

  @IsString()
  targetUrn: string;

  @IsEnum(RelationType)
  relationType: RelationType;

  @IsOptional()
  @IsString()
  provenance?: string;

  @IsOptional()
  @IsObject()
  sourceVersion?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListRelationshipsDto {
  @IsString()
  urn: string;
}

export class SetMappingDto {
  @IsString()
  planeProjectId: string;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsIn(['primary', 'secondary'])
  mappingKind?: 'primary' | 'secondary';
}

export class ListMappingsDto {
  @IsOptional()
  @IsString()
  planeProjectId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class ResolveDto {
  @IsArray()
  @IsString({ each: true })
  urns: string[];

  @IsOptional()
  @IsString()
  planeProjectId?: string;

  @IsOptional()
  @IsString()
  displayMode?: string;
}

export class CreateWorkItemFromHubDto {
  @IsString()
  sourceUrn: string;

  @IsString()
  planeProjectId: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  descriptionHtml?: string;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsEnum(RelationType)
  relationType?: RelationType;
}

export class SearchWorkItemsDto {
  @IsString()
  planeProjectId: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class BulkWorkItemRowDto {
  @IsString()
  sourceUrn: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  descriptionHtml?: string;

  @IsOptional()
  @IsString()
  priority?: string;
}

export class RegisterRequirementDto {
  @IsUUID()
  pageId: string;

  @IsString()
  blockId: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class TransitionRequirementDto {
  @IsUUID()
  id: string;

  @IsString()
  state: string;
}

export class FederatedSearchDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  planeProjectId?: string;
}

export class BulkCreateWorkItemsDto {
  @IsString()
  planeProjectId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkWorkItemRowDto)
  rows: BulkWorkItemRowDto[];
}

export class PromotePageDto {
  @IsString()
  planeProjectId: string;

  @IsString()
  planePageId: string;

  @IsString()
  title: string;

  @IsString()
  contentHtml: string;
}

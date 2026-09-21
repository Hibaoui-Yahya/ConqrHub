import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class Limit50Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class Limit20Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class SpaceIdDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  space_id: string;
}

export class PageIdDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  page_id: string;
}

export class SpaceListDto extends Limit50Dto {}
export class SpaceReadDto extends SpaceIdDto {}

export class SpaceCreateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/\S/)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/\S/)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class SpaceUpdateDto extends SpaceIdDto {
  @ValidateIf(
    (object, value) => value !== undefined || object.description === undefined,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/\S/)
  name?: string;

  @ValidateIf(
    (object, value) => value !== undefined || object.name === undefined,
  )
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class PageSearchDto extends Limit20Dto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/\S/)
  query: string;
}

export class PageListDto extends SpaceIdDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  parent_page_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class PageRecentDto extends Limit20Dto {}

export class PageHistoryDto extends PageIdDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class PageCreateDto extends SpaceIdDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/\S/)
  title: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  parent_page_id?: string;
}

export class PageUpdateDto extends PageIdDto {
  @ValidateIf(
    (object, value) => value !== undefined || object.content === undefined,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/\S/)
  title?: string;

  @ValidateIf(
    (object, value) => value !== undefined || object.title === undefined,
  )
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(['replace', 'append', 'prepend'])
  content_operation?: 'replace' | 'append' | 'prepend';
}

export class CommentListDto extends PageIdDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CommentCreateDto extends PageIdDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  @Matches(/\S/)
  text: string;
}

export class CommentUpdateDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/)
  comment_id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  @Matches(/\S/)
  text: string;
}

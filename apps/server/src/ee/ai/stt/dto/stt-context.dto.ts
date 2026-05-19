import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMaxSize,
} from 'class-validator';

export class SttContextDto {
  @IsString()
  @IsIn(['chat', 'ask-ai', 'search', 'page'])
  kind!: 'chat' | 'ask-ai' | 'search' | 'page';

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  mentionPageIds?: string[];
}

import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsUUID()
  @IsString()
  chatId?: string;

  @IsString()
  @MaxLength(32_000)
  content: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedPageIds?: string[];

  @IsOptional()
  @IsUUID()
  @IsString()
  contextPageId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];

  /**
   * Optional space scope: the assistant is told to prefer this space and to
   * pass it to rag_retrieve / list_space_pages. The user must be able to
   * Read pages in it, otherwise the stream emits a `forbidden` error.
   */
  @IsOptional()
  @IsUUID()
  @IsString()
  spaceId?: string;
}

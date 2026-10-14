import {
  IsArray,
  IsIn,
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

  /**
   * Answer mode. "deep" gives the agent more steps and asks it to read and
   * compare several pages before answering; "fast" (default) is unchanged.
   */
  @IsOptional()
  @IsIn(['fast', 'deep'])
  mode?: 'fast' | 'deep';
}

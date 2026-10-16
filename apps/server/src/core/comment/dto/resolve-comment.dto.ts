import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class ResolveCommentDto {
  @IsUUID()
  commentId: string;

  /** Sent by the client for its cache; the server trusts the comment's own page. */
  @IsOptional()
  @IsString()
  pageId?: string;

  @IsBoolean()
  resolved: boolean;
}

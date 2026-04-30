import { IsString, MaxLength } from 'class-validator';

export class SearchChatsDto {
  @IsString()
  @MaxLength(500)
  query: string;
}

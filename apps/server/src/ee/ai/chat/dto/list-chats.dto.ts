import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ListChatsDto {
  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

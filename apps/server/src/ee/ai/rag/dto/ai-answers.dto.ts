import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AiAnswersDto {
  @IsString()
  @MaxLength(2_000)
  query: string;

  @IsOptional()
  @IsUUID()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsString()
  shareId?: string;
}

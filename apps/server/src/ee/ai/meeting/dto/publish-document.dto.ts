import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PublishDocumentDto {
  @IsString()
  @IsNotEmpty()
  spaceId!: string;

  @IsOptional()
  @IsString()
  parentPageId?: string | null;
}

import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** POST /ai/meeting/:id/publish-bundle — meeting page + documents +
 *  transcript, published together in one space. */
export class PublishBundleDto {
  @IsString()
  @IsNotEmpty()
  spaceId!: string;

  @IsOptional()
  @IsString()
  parentPageId?: string | null;

  @IsOptional()
  @IsBoolean()
  includeTranscript?: boolean;
}

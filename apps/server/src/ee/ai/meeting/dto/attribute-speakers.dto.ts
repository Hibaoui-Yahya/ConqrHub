import { IsInt } from 'class-validator';

/** POST /ai/meeting/:id/transcript/attribute — propose speaker per turn from the text. */
export class AttributeSpeakersDto {
  @IsInt()
  baseVersion!: number;
}

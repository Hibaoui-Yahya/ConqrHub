import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Editable meeting metadata (PATCH /ai/meeting/:id). */
export class UpdateMeetingDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
}

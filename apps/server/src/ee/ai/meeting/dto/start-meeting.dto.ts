import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class StartMeetingDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsBoolean()
  consent?: boolean;

  @IsOptional()
  @IsString()
  meetingType?: string;

  @IsOptional()
  languageConfig?: Record<string, unknown>;

  /** Meeting template (built-in id or custom template id). */
  @IsOptional()
  @IsString()
  templateId?: string;
}

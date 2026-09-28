import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ProcessMeetingDto {
  @IsOptional()
  @IsString()
  meetingType?: string;

  @IsOptional()
  languageConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

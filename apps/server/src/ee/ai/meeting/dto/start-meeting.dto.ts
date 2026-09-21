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
}

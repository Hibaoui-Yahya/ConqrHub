import { IsBoolean, IsOptional } from 'class-validator';

export class LogoutDto {
  /** End every session of the user, not only this browser's. */
  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}

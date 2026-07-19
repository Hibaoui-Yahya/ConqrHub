import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class WorkIntelQueryDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

export class WorkIntelBackfillDto {
  @IsOptional()
  @IsUUID()
  projectId?: string;
}

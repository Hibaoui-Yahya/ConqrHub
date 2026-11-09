import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const VERIFICATION_TYPES = ['expiring', 'qms'] as const;
const EXPIRATION_MODES = ['period', 'fixed', 'indefinite'] as const;
const PERIOD_UNITS = ['day', 'week', 'month', 'year'] as const;

export class VerificationInfoDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class CreateVerificationDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsIn(VERIFICATION_TYPES)
  type?: string;

  @IsOptional()
  @IsIn(EXPIRATION_MODES)
  mode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodAmount?: number;

  @IsOptional()
  @IsIn(PERIOD_UNITS)
  periodUnit?: string;

  @IsOptional()
  @IsDateString()
  fixedExpiresAt?: string;

  @IsArray()
  @IsUUID('all', { each: true })
  verifierIds: string[];
}

export class UpdateVerificationDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsIn(EXPIRATION_MODES)
  mode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodAmount?: number;

  @IsOptional()
  @IsIn(PERIOD_UNITS)
  periodUnit?: string;

  @IsOptional()
  @IsDateString()
  fixedExpiresAt?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  verifierIds?: string[];
}

export class DeleteVerificationDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class VerifyPageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class SubmitForApprovalDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class RejectApprovalDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class MarkObsoleteDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

/** POST pages/verification-overview */
export class VerificationOverviewDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

/** POST pages/unverified */
export class UnverifiedPagesDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Opaque keyset cursor returned as `nextCursor` by the previous call. */
  @IsOptional()
  @IsString()
  cursor?: string;
}

/** POST pages/bulk-verify */
export class BulkVerifyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  pageIds: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number;
}

export class VerificationsListDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  beforeCursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  spaceIds?: string[];

  @IsOptional()
  @IsUUID()
  verifierId?: string;

  @IsOptional()
  @IsIn(VERIFICATION_TYPES)
  type?: string;

  @IsOptional()
  @IsString()
  query?: string;
}

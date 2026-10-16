import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_SEQUENCE } from '../meeting-capture.util';

/** Last sequence number the recorder sent, per source. */
export class ExpectedLastSequenceDto {
  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(MAX_SEQUENCE)
  mic?: number;

  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(MAX_SEQUENCE)
  system?: number;
}

/** POST /ai/meeting/:id/stop. Every field is optional (old clients send {}). */
export class StopMeetingDto {
  /** Stop even when chunks are missing; the missing passages are lost. */
  @IsOptional()
  @IsBoolean()
  allowGaps?: boolean;

  /** Lets the Hub notice a lost last chunk, which no gap reveals. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ExpectedLastSequenceDto)
  expectedLastSequence?: ExpectedLastSequenceDto;
}

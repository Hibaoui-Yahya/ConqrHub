import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional } from 'class-validator';
import { MAX_CRITERIA } from '../meeting-evaluation.util';

/** POST /ai/meeting/:id/evaluation/generate — the grid to evaluate against
 *  (labels, or {label, hint}); the default grid when omitted. */
export class GenerateEvaluationDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CRITERIA)
  criteria?: unknown[];
}

/** POST /ai/meeting/:id/evaluation — the recruiter's edits. Shapes are
 *  sanitised by applyEvaluationEdit(); unknown criteria are ignored. */
export class SaveEvaluationDto {
  @IsOptional()
  @IsIn(['draft', 'validated'])
  status?: 'draft' | 'validated';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CRITERIA)
  items?: unknown[];

  @IsOptional()
  @IsObject()
  overall?: Record<string, unknown>;
}

import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum AiAction {
  IMPROVE_WRITING = 'improve_writing',
  FIX_SPELLING_GRAMMAR = 'fix_spelling_grammar',
  MAKE_SHORTER = 'make_shorter',
  MAKE_LONGER = 'make_longer',
  SIMPLIFY = 'simplify',
  CHANGE_TONE = 'change_tone',
  SUMMARIZE = 'summarize',
  EXPLAIN = 'explain',
  CONTINUE_WRITING = 'continue_writing',
  TRANSLATE = 'translate',
  CUSTOM = 'custom',
}

export const MAX_CONTENT_LENGTH = 32_000;
export const MAX_PROMPT_LENGTH = 2_000;

export class AiGenerateDto {
  @IsOptional()
  @IsEnum(AiAction)
  action?: AiAction;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CONTENT_LENGTH)
  content: string;

  // For CUSTOM action: the user-supplied instruction. For CHANGE_TONE: the
  // target tone (e.g. "formal", "friendly"). For TRANSLATE: the target
  // language. Otherwise ignored.
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PROMPT_LENGTH)
  prompt?: string;
}

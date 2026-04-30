import { Injectable, Logger } from '@nestjs/common';
import {
  AiProviderService,
  StreamTextResult,
} from '../providers/ai-provider.service';
import { AiAction, AiGenerateDto } from './dto/ai-generate.dto';
import { buildPrompt } from './prompts';

const DEFAULT_ACTION = AiAction.IMPROVE_WRITING;
const MAX_OUTPUT_TOKENS = 1024;

export type AiGenerateResult = {
  text: string;
  action: AiAction;
  totalTokens?: number;
};

@Injectable()
export class AiGenerateService {
  private readonly logger = new Logger(AiGenerateService.name);

  constructor(private readonly provider: AiProviderService) {}

  async generate(dto: AiGenerateDto): Promise<AiGenerateResult> {
    const action = dto.action ?? DEFAULT_ACTION;
    const { system, prompt } = buildPrompt(action, {
      content: dto.content,
      prompt: dto.prompt,
    });
    const result = await this.provider.generate({
      system,
      prompt,
      temperature: temperatureFor(action),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    return {
      text: result.text,
      action,
      totalTokens: result.usage?.totalTokens,
    };
  }

  /**
   * Returns the AI SDK stream — caller pipes textStream into SSE.
   */
  stream(dto: AiGenerateDto): { action: AiAction; result: StreamTextResult } {
    const action = dto.action ?? DEFAULT_ACTION;
    const { system, prompt } = buildPrompt(action, {
      content: dto.content,
      prompt: dto.prompt,
    });
    return {
      action,
      result: this.provider.stream({
        system,
        prompt,
        temperature: temperatureFor(action),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      }),
    };
  }
}

// FIX_SPELLING_GRAMMAR and TRANSLATE want deterministic output; others
// can breathe a little. Tuned conservatively — bump per-action if specific
// output starts to feel robotic.
function temperatureFor(action: AiAction): number {
  switch (action) {
    case AiAction.FIX_SPELLING_GRAMMAR:
    case AiAction.TRANSLATE:
      return 0.2;
    case AiAction.SUMMARIZE:
    case AiAction.EXPLAIN:
      return 0.4;
    default:
      return 0.7;
  }
}

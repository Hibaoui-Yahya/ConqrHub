import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from '../providers/ai-provider.service';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';

const TITLE_SYSTEM =
  'Produce a 4 to 6 word title summarizing the conversation. Output only the title text. No quotes. No trailing punctuation. No prefixes such as "Title:".';
const MAX_PROMPT_CHARS = 500;

@Injectable()
export class AiChatTitleService {
  private readonly logger = new Logger(AiChatTitleService.name);

  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly chatRepo: AiChatRepo,
  ) {}

  /**
   * Generates a short title from the first user message and persists it.
   * Failures are swallowed so the chat stays usable with a null title.
   */
  async generate(
    chatId: string,
    workspaceId: string,
    firstUserMessage: string,
  ): Promise<void> {
    try {
      const prompt = firstUserMessage.slice(0, MAX_PROMPT_CHARS);
      const result = await this.aiProvider.generate({
        system: TITLE_SYSTEM,
        prompt,
        temperature: 0.3,
        maxOutputTokens: 24,
      });
      const title = result.text.trim().slice(0, 255);
      if (title) {
        await this.chatRepo.update(chatId, workspaceId, { title });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Title generation failed for chat ${chatId}: ${msg}`);
    }
  }
}

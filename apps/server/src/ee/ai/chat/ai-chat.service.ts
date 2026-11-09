import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AiChat, AiChatMessage, User } from '@docmost/db/types/entity.types';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';
import { AiChatMessageRepo } from '@docmost/db/repos/ai-chat/ai-chat-message.repo';
import { ListChatsDto } from './dto/list-chats.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { SearchChatsDto } from './dto/search-chats.dto';
import { FeedbackRating } from './dto/message-feedback.dto';

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly chatRepo: AiChatRepo,
    private readonly messageRepo: AiChatMessageRepo,
  ) {}

  async create(user: User): Promise<AiChat> {
    return this.chatRepo.insert({
      workspaceId: user.workspaceId,
      creatorId: user.id,
    });
  }

  async list(dto: ListChatsDto, user: User) {
    return this.chatRepo.listByCreator(user.id, user.workspaceId, {
      limit: dto.limit ?? 30,
      cursor: dto.cursor,
    } as any);
  }

  async info(
    chatId: string,
    user: User,
  ): Promise<{ chat: AiChat; messages: AiChatMessage[] }> {
    const chat = await this.requireOwnedChat(chatId, user);
    const messages = await this.messageRepo.listByChat(
      chatId,
      user.workspaceId,
    );
    return { chat, messages };
  }

  async delete(chatId: string, user: User): Promise<void> {
    await this.requireOwnedChat(chatId, user);
    await this.chatRepo.softDelete(chatId, user.workspaceId);
  }

  async update(dto: UpdateChatDto, user: User): Promise<void> {
    await this.requireOwnedChat(dto.chatId, user);
    await this.chatRepo.update(dto.chatId, user.workspaceId, {
      title: dto.title,
    });
  }

  async search(dto: SearchChatsDto, user: User): Promise<AiChat[]> {
    const messages = await this.messageRepo.searchByWorkspace(
      user.workspaceId,
      user.id,
      dto.query,
    );
    if (!messages.length) return [];

    // Collect unique chatIds preserving order and re-hydrate chat rows.
    const chatIds = [...new Set(messages.map((m) => m.chatId))];
    const chats = await Promise.all(
      chatIds.map((id) => this.chatRepo.findById(id, user.workspaceId)),
    );
    return chats.filter((c): c is AiChat => c != null);
  }

  /**
   * Records a thumbs up/down on an assistant message. The message must be in
   * the caller's workspace and in a chat they created (404 otherwise, so
   * existence is not leaked). Stored under metadata.feedback; a second call
   * overwrites the previous rating.
   */
  async setMessageFeedback(
    messageId: string,
    user: User,
    rating: FeedbackRating,
    comment?: string,
  ): Promise<{ ok: true }> {
    const message = await this.messageRepo.findById(
      messageId,
      user.workspaceId,
    );
    if (!message) throw new NotFoundException('Message not found');
    await this.requireOwnedChat(message.chatId, user);

    await this.messageRepo.updateMetadata(messageId, user.workspaceId, {
      feedback: {
        rating,
        comment: comment?.trim() || null,
        userId: user.id,
        at: new Date().toISOString(),
      },
    });
    return { ok: true };
  }

  async requireOwnedChat(chatId: string, user: User): Promise<AiChat> {
    const chat = await this.chatRepo.findById(chatId, user.workspaceId);
    if (!chat || chat.creatorId !== user.id) {
      // Return 404 for both not-found and wrong-owner to avoid leaking existence.
      throw new NotFoundException('Chat not found');
    }
    return chat;
  }
}

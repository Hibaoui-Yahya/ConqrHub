import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { SearchModule } from '../../../core/search/search.module';
import { EnvironmentModule } from '../../../integrations/environment/environment.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatStreamController } from './ai-chat-stream.controller';
import { AiChatService } from './ai-chat.service';
import { AiChatStreamService } from './ai-chat-stream.service';
import { AiChatTitleService } from './ai-chat-title.service';
import { ChatToolRegistry } from './tools/chat-tool.registry';
import { SearchPagesTool } from './tools/search-pages.tool';
import { RagRetrieveTool } from './tools/rag-retrieve.tool';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';

// AiChatRepo and AiChatMessageRepo are registered in the @Global() DatabaseModule
// and are therefore available here without a local re-registration.
@Module({
  imports: [
    EnvironmentModule,
    RagModule,
    SearchModule,
  ],
  controllers: [AiChatController, AiChatStreamController],
  providers: [
    AiChatService,
    AiChatStreamService,
    AiChatTitleService,
    ChatToolRegistry,
    SearchPagesTool,
    RagRetrieveTool,
    SpaceAbilityFactory,
  ],
})
export class AiChatModule {}

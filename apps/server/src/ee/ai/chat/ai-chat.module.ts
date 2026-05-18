import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { AiProviderModule } from '../providers/ai-provider.module';
import { SearchModule } from '../../../core/search/search.module';
import { EnvironmentModule } from '../../../integrations/environment/environment.module';
import { PageModule } from '../../../core/page/page.module';
import { SpaceModule } from '../../../core/space/space.module';
import { CommentModule } from '../../../core/comment/comment.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatStreamController } from './ai-chat-stream.controller';
import { AiChatService } from './ai-chat.service';
import { AiChatStreamService } from './ai-chat-stream.service';
import { AiChatTitleService } from './ai-chat-title.service';
import { ChatToolRegistry } from './tools/chat-tool.registry';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
// P4 tools
import { SearchPagesTool } from './tools/search-pages.tool';
import { RagRetrieveTool } from './tools/rag-retrieve.tool';
// P5 read tools
import { GetPageTool } from './tools/get-page.tool';
import { ListRecentPagesTool } from './tools/list-recent-pages.tool';
import { ListSpacePagesTool } from './tools/list-space-pages.tool';
import { GetPageBreadcrumbsTool } from './tools/get-page-breadcrumbs.tool';
import { ListSpacesTool } from './tools/list-spaces.tool';
import { GetSpaceInfoTool } from './tools/get-space-info.tool';
import { GetPageCommentsTool } from './tools/get-page-comments.tool';
import { GetPageHistoryTool } from './tools/get-page-history.tool';
// P5 write tools
import { CreatePageTool } from './tools/create-page.tool';
import { UpdatePageTitleTool } from './tools/update-page-title.tool';
import { UpdatePageContentTool } from './tools/update-page-content.tool';
import { MovePageTool } from './tools/move-page.tool';
import { CreateCommentTool } from './tools/create-comment.tool';

// AiChatRepo and AiChatMessageRepo are registered in the @Global() DatabaseModule
// and are therefore available here without a local re-registration.
@Module({
  imports: [
    EnvironmentModule,
    AiProviderModule,
    RagModule,
    SearchModule,
    PageModule,
    SpaceModule,
    CommentModule,
  ],
  controllers: [AiChatController, AiChatStreamController],
  providers: [
    AiChatService,
    AiChatStreamService,
    AiChatTitleService,
    ChatToolRegistry,
    SpaceAbilityFactory,
    // P4
    SearchPagesTool,
    RagRetrieveTool,
    // P5 read
    GetPageTool,
    ListRecentPagesTool,
    ListSpacePagesTool,
    GetPageBreadcrumbsTool,
    ListSpacesTool,
    GetSpaceInfoTool,
    GetPageCommentsTool,
    GetPageHistoryTool,
    // P5 write
    CreatePageTool,
    UpdatePageTitleTool,
    UpdatePageContentTool,
    MovePageTool,
    CreateCommentTool,
  ],
  exports: [ChatToolRegistry],
})
export class AiChatModule {}

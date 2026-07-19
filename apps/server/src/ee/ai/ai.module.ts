import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../integrations/environment/environment.module';
import { AiProviderModule } from './providers/ai-provider.module';
import { AiGenerateService } from './generate/ai-generate.service';
import { AiGenerateController } from './generate/ai-generate.controller';
import { WorkspaceAiToggleGuard } from './guards/workspace-ai-toggle.guard';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { RagModule } from './rag/rag.module';
import { AiChatModule } from './chat/ai-chat.module';
import { McpModule } from './mcp/mcp.module';
import { SttModule } from './stt/stt.module';
import { MeetingModule } from './meeting/meeting.module';
import { WorkIntelModule } from './work-intel/work-intel.module';

@Module({
  imports: [
    EnvironmentModule,
    AiProviderModule,
    EmbeddingsModule,
    RagModule,
    AiChatModule,
    McpModule,
    SttModule,
    MeetingModule,
    WorkIntelModule,
  ],
  controllers: [AiGenerateController],
  providers: [AiGenerateService, WorkspaceAiToggleGuard],
  exports: [AiProviderModule],
})
export class AiModule {}

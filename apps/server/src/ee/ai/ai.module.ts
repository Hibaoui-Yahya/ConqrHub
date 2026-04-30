import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../integrations/environment/environment.module';
import { AiProviderService } from './providers/ai-provider.service';
import { AiGenerateService } from './generate/ai-generate.service';
import { AiGenerateController } from './generate/ai-generate.controller';
import { WorkspaceAiToggleGuard } from './guards/workspace-ai-toggle.guard';

/**
 * EE AI module. Foundation phase: provider abstraction + Generative AI
 * (Ask AI) endpoints. Future phases (embeddings, answers, chat, MCP) will
 * register additional submodules under apps/server/src/ee/ai/.
 */
@Module({
  imports: [EnvironmentModule],
  controllers: [AiGenerateController],
  providers: [AiProviderService, AiGenerateService, WorkspaceAiToggleGuard],
  exports: [AiProviderService],
})
export class AiModule {}

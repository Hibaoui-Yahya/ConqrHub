import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../integrations/environment/environment.module';
import { AiProviderService } from './providers/ai-provider.service';
import { AiGenerateService } from './generate/ai-generate.service';
import { AiGenerateController } from './generate/ai-generate.controller';
import { WorkspaceAiToggleGuard } from './guards/workspace-ai-toggle.guard';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { RagModule } from './rag/rag.module';

/**
 * EE AI module. Includes:
 *   - Provider abstraction (AiProviderService, all drivers)
 *   - Generative AI / Ask AI endpoints
 *   - Embedding storage, chunking, queue processor, and admin backfill (Branch 2)
 *   - RAG Answers: similarity search + context assembly + answer generation (Branch 4)
 * Future phases (chat, MCP) register additional submodules here.
 */
@Module({
  imports: [EnvironmentModule, EmbeddingsModule, RagModule],
  controllers: [AiGenerateController],
  providers: [AiProviderService, AiGenerateService, WorkspaceAiToggleGuard],
  exports: [AiProviderService],
})
export class AiModule {}

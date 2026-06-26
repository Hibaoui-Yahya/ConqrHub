import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnvironmentModule } from '../../../integrations/environment/environment.module';
import { QueueName } from '../../../integrations/queue/constants';
import { ChunkingService } from './chunking.service';
import { EmbeddingRepository } from './embedding.repository';
import { EmbeddingIndexerService } from './embedding-indexer.service';
import { InsightIndexerService } from './insight-indexer.service';
import { AiEmbeddingQueueProcessor } from './ai-embedding-queue.processor';
import { EmbeddingsAdminController } from './embeddings-admin.controller';
import { EmbeddingReindexScheduler } from './embedding-reindex.scheduler';
import WorkspaceAbilityFactory from '../../../core/casl/abilities/workspace-ability.factory';
import { AiProviderModule } from '../providers/ai-provider.module';
import { PageVerificationModule } from '../../page-verification/page-verification.module';

@Module({
  imports: [
    EnvironmentModule,
    AiProviderModule,
    PageVerificationModule,
    BullModule.registerQueue({ name: QueueName.AI_QUEUE }),
  ],
  controllers: [EmbeddingsAdminController],
  providers: [
    ChunkingService,
    EmbeddingRepository,
    EmbeddingIndexerService,
    InsightIndexerService,
    AiEmbeddingQueueProcessor,
    EmbeddingReindexScheduler,
    WorkspaceAbilityFactory,
  ],
  exports: [
    EmbeddingRepository,
    EmbeddingIndexerService,
    InsightIndexerService,
    ChunkingService,
  ],
})
export class EmbeddingsModule {}

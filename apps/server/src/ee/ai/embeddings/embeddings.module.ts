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
import { WorkItemIndexerService } from './work-item-indexer.service';
import { IntegrationModule } from '../../../core/integration/integration.module';

@Module({
  imports: [
    EnvironmentModule,
    AiProviderModule,
    PageVerificationModule,
    IntegrationModule,
    BullModule.registerQueue({ name: QueueName.AI_QUEUE }),
  ],
  controllers: [EmbeddingsAdminController],
  providers: [
    ChunkingService,
    EmbeddingRepository,
    EmbeddingIndexerService,
    InsightIndexerService,
    WorkItemIndexerService,
    AiEmbeddingQueueProcessor,
    EmbeddingReindexScheduler,
    WorkspaceAbilityFactory,
  ],
  exports: [
    EmbeddingRepository,
    EmbeddingIndexerService,
    InsightIndexerService,
    WorkItemIndexerService,
    ChunkingService,
  ],
})
export class EmbeddingsModule {}

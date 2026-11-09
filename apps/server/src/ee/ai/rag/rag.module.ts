import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { AiProviderModule } from '../providers/ai-provider.module';
import { RagRetrievalService } from './rag-retrieval.service';
import { RagAccessFilter } from './rag-access.filter';
import { RagAnswerService } from './rag-answer.service';
import { RagSourceService } from './rag-source.service';
import { RagController } from './rag.controller';
import { AiAnswersController } from './ai-answers.controller';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';

@Module({
  imports: [EmbeddingsModule, AiProviderModule],
  controllers: [RagController, AiAnswersController],
  providers: [
    RagRetrievalService,
    RagAccessFilter,
    RagAnswerService,
    RagSourceService,
    SpaceAbilityFactory,
  ],
  exports: [RagRetrievalService, RagAccessFilter, RagSourceService],
})
export class RagModule {}

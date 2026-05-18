import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { AiProviderModule } from '../providers/ai-provider.module';
import { RagRetrievalService } from './rag-retrieval.service';
import { RagAnswerService } from './rag-answer.service';
import { RagController } from './rag.controller';
import { AiAnswersController } from './ai-answers.controller';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';

@Module({
  imports: [EmbeddingsModule, AiProviderModule],
  controllers: [RagController, AiAnswersController],
  providers: [RagRetrievalService, RagAnswerService, SpaceAbilityFactory],
  exports: [RagRetrievalService],
})
export class RagModule {}

import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { RagRetrievalService } from './rag-retrieval.service';
import { RagAnswerService } from './rag-answer.service';
import { RagController } from './rag.controller';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';

@Module({
  imports: [EmbeddingsModule],
  controllers: [RagController],
  providers: [RagRetrievalService, RagAnswerService, SpaceAbilityFactory],
  exports: [RagRetrievalService],
})
export class RagModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '../../integrations/queue/constants';
import { AiProviderModule } from '../ai/providers/ai-provider.module';
import { AttachmentExtractionService } from './attachment-extraction.service';
import { AttachmentExtractionStore } from './attachment-extraction.store';
import { PageAttachmentContentService } from './page-attachment-content.service';
import { AttachmentEeService } from './attachment-ee.service';
import { AttachmentIngestionReconciler } from './attachment-ingestion.reconciler';

/**
 * Text extraction (native + OCR) of documents attached to pages, and the
 * hand-off of that text to the verified knowledge-base indexer.
 * AttachmentEeService is also resolved at runtime by the core
 * AttachmentProcessor for ATTACHMENT_INDEX_CONTENT / ATTACHMENT_INDEXING jobs.
 */
@Module({
  imports: [
    AiProviderModule,
    BullModule.registerQueue({ name: QueueName.AI_QUEUE }),
  ],
  providers: [
    AttachmentExtractionStore,
    AttachmentExtractionService,
    PageAttachmentContentService,
    AttachmentEeService,
    AttachmentIngestionReconciler,
  ],
  exports: [
    AttachmentExtractionService,
    PageAttachmentContentService,
    AttachmentEeService,
  ],
})
export class AttachmentsEeModule {}

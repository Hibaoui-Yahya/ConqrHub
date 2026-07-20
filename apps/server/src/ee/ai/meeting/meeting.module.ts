import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EnvironmentModule } from '../../../integrations/environment/environment.module';
import { StorageModule } from '../../../integrations/storage/storage.module';
import { QueueName } from '../../../integrations/queue/constants';
import { AiProviderModule } from '../providers/ai-provider.module';
import { SttModule } from '../stt/stt.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { PageModule } from '../../../core/page/page.module';
import { CaslModule } from '../../../core/casl/casl.module';
import { IntegrationModule } from '../../../core/integration/integration.module';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingIntelligenceController } from './meeting-intelligence.controller';
import { MeetingWebhookController } from './meeting-webhook.controller';
import { MeetingPipelineService } from './meeting-pipeline.service';
import { MeetingStorageService } from './meeting-storage.service';
import { MeetingAnalysisService } from './meeting-analysis.service';
import { MeetingDocumentsService } from './meeting-documents.service';
import { MeetingProposalsService } from './meeting-proposals.service';
import { MeetingQueueProcessor } from './meeting-queue.processor';

@Module({
  imports: [
    EnvironmentModule,
    AiProviderModule,
    SttModule,
    TranscriptionModule,
    StorageModule,
    PageModule,
    CaslModule,
    IntegrationModule,
    BullModule.registerQueue({ name: QueueName.MEETING_QUEUE }),
  ],
  controllers: [
    MeetingController,
    MeetingIntelligenceController,
    MeetingWebhookController,
  ],
  providers: [
    MeetingService,
    MeetingPipelineService,
    MeetingStorageService,
    MeetingAnalysisService,
    MeetingDocumentsService,
    MeetingProposalsService,
    MeetingQueueProcessor,
  ],
})
export class MeetingModule {}

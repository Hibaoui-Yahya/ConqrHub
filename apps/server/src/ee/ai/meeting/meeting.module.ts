import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingTemplateController } from './meeting-template.controller';
import { MeetingTemplateService } from './meeting-template.service';
import { MeetingPipelineProcessor } from './meeting-pipeline.processor';
import { AiProviderModule } from '../providers/ai-provider.module';
import { SttModule } from '../stt/stt.module';
import { IntegrationModule } from '../../../core/integration/integration.module';
import { PageModule } from '../../../core/page/page.module';
import { NotificationModule } from '../../../core/notification/notification.module';

@Module({
  imports: [
    AiProviderModule,
    SttModule,
    IntegrationModule,
    PageModule,
    NotificationModule,
  ],
  controllers: [MeetingController, MeetingTemplateController],
  providers: [MeetingService, MeetingTemplateService, MeetingPipelineProcessor],
  exports: [MeetingService, MeetingTemplateService],
})
export class MeetingModule {}
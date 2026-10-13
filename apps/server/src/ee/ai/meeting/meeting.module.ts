import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { MeetingTemplateController } from './meeting-template.controller';
import { MeetingTemplateService } from './meeting-template.service';
import { AiProviderModule } from '../providers/ai-provider.module';
import { SttModule } from '../stt/stt.module';
import { IntegrationModule } from '../../../core/integration/integration.module';
import { PageModule } from '../../../core/page/page.module';

@Module({
  imports: [AiProviderModule, SttModule, IntegrationModule, PageModule],
  controllers: [MeetingController, MeetingTemplateController],
  providers: [MeetingService, MeetingTemplateService],
  exports: [MeetingService, MeetingTemplateService],
})
export class MeetingModule {}
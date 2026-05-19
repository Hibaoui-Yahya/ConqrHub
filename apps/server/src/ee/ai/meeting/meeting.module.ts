import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../../integrations/environment/environment.module';
import { AiProviderModule } from '../providers/ai-provider.module';
import { SttModule } from '../stt/stt.module';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';

@Module({
  imports: [EnvironmentModule, AiProviderModule, SttModule],
  controllers: [MeetingController],
  providers: [MeetingService],
})
export class MeetingModule {}

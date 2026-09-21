import { Module } from '@nestjs/common';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { AiProviderModule } from '../providers/ai-provider.module';
import { SttModule } from '../stt/stt.module';

@Module({
  imports: [AiProviderModule, SttModule],
  controllers: [MeetingController],
  providers: [MeetingService],
  exports: [MeetingService],
})
export class MeetingModule {}
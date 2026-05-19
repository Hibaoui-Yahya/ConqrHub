import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../../integrations/environment/environment.module';
import { AiProviderModule } from '../providers/ai-provider.module';
import { SttController } from './stt.controller';
import { SttService } from './stt.service';

@Module({
  imports: [EnvironmentModule, AiProviderModule],
  controllers: [SttController],
  providers: [SttService],
})
export class SttModule {}

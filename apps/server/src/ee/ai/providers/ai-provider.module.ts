import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../../integrations/environment/environment.module';
import { AiProviderService } from './ai-provider.service';

@Module({
  imports: [EnvironmentModule],
  providers: [AiProviderService],
  exports: [AiProviderService],
})
export class AiProviderModule {}

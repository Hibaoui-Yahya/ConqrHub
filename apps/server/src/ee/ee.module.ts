import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { ApiKeyModule } from './api-key/api-key.module';

@Module({
  imports: [AiModule, ApiKeyModule],
  exports: [AiModule, ApiKeyModule],
})
export class EeModule {}

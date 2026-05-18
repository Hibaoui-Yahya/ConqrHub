import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { PageVerificationModule } from './page-verification/page-verification.module';

@Module({
  imports: [AiModule, ApiKeyModule, PageVerificationModule],
  exports: [AiModule, ApiKeyModule, PageVerificationModule],
})
export class EeModule {}

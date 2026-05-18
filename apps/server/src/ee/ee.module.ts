import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { PageVerificationModule } from './page-verification/page-verification.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [AiModule, ApiKeyModule, PageVerificationModule, AuditModule],
  exports: [AiModule, ApiKeyModule, PageVerificationModule, AuditModule],
})
export class EeModule {}

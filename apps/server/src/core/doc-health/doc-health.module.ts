import { Module } from '@nestjs/common';
import { DocHealthController } from './doc-health.controller';
import { DocHealthService } from './services/doc-health.service';
import { HealthIssuesService } from './services/issues.service';
import { ScoringService } from './services/scoring.service';
import { CaslModule } from '../casl/casl.module';

@Module({
  imports: [CaslModule],
  controllers: [DocHealthController],
  providers: [ScoringService, DocHealthService, HealthIssuesService],
  exports: [ScoringService, DocHealthService, HealthIssuesService],
})
export class DocHealthModule {}

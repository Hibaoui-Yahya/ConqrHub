import { Module } from '@nestjs/common';
import { DocHealthController } from './doc-health.controller';
import { DocHealthService } from './services/doc-health.service';
import { HealthIssuesService } from './services/issues.service';
import { ScoringService } from './services/scoring.service';
import { HealthSnapshotService } from './services/snapshot.service';
import { HealthAlertsService } from './services/alerts.service';
import { BrokenLinksService } from './services/broken-links.service';
import { DocHealthCronService } from './services/doc-health-cron.service';
import { CaslModule } from '../casl/casl.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [CaslModule, NotificationModule],
  controllers: [DocHealthController],
  providers: [
    ScoringService,
    DocHealthService,
    HealthIssuesService,
    HealthSnapshotService,
    HealthAlertsService,
    BrokenLinksService,
    DocHealthCronService,
  ],
  exports: [
    ScoringService,
    DocHealthService,
    HealthIssuesService,
    HealthSnapshotService,
    HealthAlertsService,
    BrokenLinksService,
  ],
})
export class DocHealthModule {}

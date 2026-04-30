import { Module } from '@nestjs/common';
import { DocHealthController } from './doc-health.controller';
import { DocHealthService } from './services/doc-health.service';
import { HealthIssuesService } from './services/issues.service';
import { ScoringService } from './services/scoring.service';
import { HealthSnapshotService } from './services/snapshot.service';
import { HealthAlertsService } from './services/alerts.service';
import { BrokenLinksService } from './services/broken-links.service';
import { LinkCheckerService } from './services/link-checker.service';
import { DocHealthCronService } from './services/doc-health-cron.service';
import { KnowledgeGapsService } from './services/knowledge-gaps.service';
import { DuplicatesService } from './services/duplicates.service';
import { CaslModule } from '../casl/casl.module';
import { NotificationModule } from '../notification/notification.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [CaslModule, NotificationModule, SearchModule],
  controllers: [DocHealthController],
  providers: [
    ScoringService,
    DocHealthService,
    HealthIssuesService,
    HealthSnapshotService,
    HealthAlertsService,
    BrokenLinksService,
    LinkCheckerService,
    KnowledgeGapsService,
    DuplicatesService,
    DocHealthCronService,
  ],
  exports: [
    ScoringService,
    DocHealthService,
    HealthIssuesService,
    HealthSnapshotService,
    HealthAlertsService,
    BrokenLinksService,
    LinkCheckerService,
    KnowledgeGapsService,
    DuplicatesService,
  ],
})
export class DocHealthModule {}

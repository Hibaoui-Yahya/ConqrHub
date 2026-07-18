import { Module } from '@nestjs/common';
import { CaslModule } from '../casl/casl.module';
import { SearchModule } from '../search/search.module';
import { PageModule } from '../page/page.module';
import { IntegrationController } from './integration.controller';
import { PlaneWebhookController } from './plane-webhook.controller';
import { RelationshipService } from './services/relationship.service';
import { ProjectSpaceMappingService } from './services/project-space-mapping.service';
import { SmartObjectResolverService } from './services/smart-object-resolver.service';
import { PlaneClientService } from './services/plane-client.service';
import { PlaneWebhookService } from './services/plane-webhook.service';
import { PlaneWebhookProcessorService } from './services/plane-webhook-processor.service';
import { IntegrationEventService } from './services/integration-event.service';
import { WorkItemCreationService } from './services/work-item-creation.service';
import { TraceabilityService } from './services/traceability.service';
import { NotificationDedupService } from './services/notification-dedup.service';
import { FederatedSearchService } from './services/federated-search.service';
import { LifecycleAutomationService } from './services/lifecycle-automation.service';
import { RequirementService } from './services/requirement.service';
import { IntegrationEventBus } from './services/integration-event-bus';
import { CrossProductInsightService } from './services/cross-product-insight.service';
import { DelegatedTokenService } from './services/delegated-token.service';
import { PagePromotionService } from './services/page-promotion.service';

/**
 * Conqr Integration Layer (blueprint §8). Owns cross-product relationships,
 * project↔space mappings, the Plane adapter, webhook ingestion, the smart-object
 * resolver and the event/audit outbox. Repos are provided globally by
 * DatabaseModule; CaslModule supplies the workspace ability factory.
 */
@Module({
  imports: [CaslModule, SearchModule, PageModule],
  controllers: [IntegrationController, PlaneWebhookController],
  providers: [
    RelationshipService,
    ProjectSpaceMappingService,
    SmartObjectResolverService,
    PlaneClientService,
    PlaneWebhookService,
    PlaneWebhookProcessorService,
    IntegrationEventService,
    WorkItemCreationService,
    TraceabilityService,
    NotificationDedupService,
    FederatedSearchService,
    LifecycleAutomationService,
    RequirementService,
    IntegrationEventBus,
    CrossProductInsightService,
    DelegatedTokenService,
    PagePromotionService,
  ],
  exports: [
    RelationshipService,
    ProjectSpaceMappingService,
    SmartObjectResolverService,
    WorkItemCreationService,
    TraceabilityService,
    NotificationDedupService,
    FederatedSearchService,
    RequirementService,
    CrossProductInsightService,
    DelegatedTokenService,
  ],
})
export class IntegrationModule {}

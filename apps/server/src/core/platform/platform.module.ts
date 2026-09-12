/**
 * ConqrHub — Conqr platform integration.
 *
 * Global, so the JWT strategy can ask for the platform context without every feature module having
 * to import this one. The services inside are inert in standalone mode: `PlatformConfigService`
 * reports `standalone` and nothing else is ever called.
 */
import { Global, Module } from '@nestjs/common';
import { PlatformConfigService } from './platform.config';
import { PlatformClientsService } from './platform-clients.service';
import { PlatformContextService } from './platform-context.service';
import { TenantBindingService } from './tenant-binding.service';

@Global()
@Module({
  providers: [
    PlatformConfigService,
    PlatformClientsService,
    PlatformContextService,
    TenantBindingService,
  ],
  exports: [
    PlatformConfigService,
    PlatformClientsService,
    PlatformContextService,
    TenantBindingService,
  ],
})
export class PlatformModule {}

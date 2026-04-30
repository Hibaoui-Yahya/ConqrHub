import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';

/**
 * Enterprise Edition root module. Loaded dynamically by app.module.ts:
 *
 *   try {
 *     enterpriseModules.push(require('./ee/ee.module')?.EeModule);
 *   } catch (err) { ... }
 *
 * Adding a new EE feature: create a submodule under apps/server/src/ee/<feature>/
 * and import it here. The bootstrap is best-effort — if EE code is missing
 * from a build, the rest of the app still starts (CE mode).
 */
@Module({
  imports: [AiModule],
  exports: [AiModule],
})
export class EeModule {}

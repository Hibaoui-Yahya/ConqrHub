import { Module } from '@nestjs/common';
import { ExpertInsightsRepo } from './expert-insights.repo';
import { ExpertInsightsService } from './expert-insights.service';
import { ExpertInsightsController } from './expert-insights.controller';
import { ExpertiseRepo } from './expertise.repo';
import { ExpertiseService } from './expertise.service';

@Module({
  controllers: [ExpertInsightsController],
  providers: [
    ExpertInsightsRepo,
    ExpertInsightsService,
    ExpertiseRepo,
    ExpertiseService,
  ],
  exports: [ExpertInsightsService],
})
export class ExpertInsightsModule {}

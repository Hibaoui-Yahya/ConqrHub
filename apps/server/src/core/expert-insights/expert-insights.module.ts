import { Module } from '@nestjs/common';
import { ExpertInsightsRepo } from './expert-insights.repo';
import { ExpertInsightsService } from './expert-insights.service';
import { ExpertInsightsController } from './expert-insights.controller';

@Module({
  controllers: [ExpertInsightsController],
  providers: [ExpertInsightsRepo, ExpertInsightsService],
  exports: [ExpertInsightsService],
})
export class ExpertInsightsModule {}

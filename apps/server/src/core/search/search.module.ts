import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchAnalyticsService } from './search-analytics.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, SearchAnalyticsService],
  exports: [SearchService, SearchAnalyticsService],
})
export class SearchModule {}

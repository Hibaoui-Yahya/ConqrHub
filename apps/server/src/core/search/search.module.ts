import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchAnalyticsService } from './search-analytics.service';
import { AttachmentSearchController } from './attachment-search.controller';
import { AttachmentSearchService } from './attachment-search.service';

@Module({
  controllers: [SearchController, AttachmentSearchController],
  providers: [SearchService, SearchAnalyticsService, AttachmentSearchService],
  exports: [SearchService, SearchAnalyticsService],
})
export class SearchModule {}

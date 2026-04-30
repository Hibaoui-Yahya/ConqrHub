import { DB } from '@docmost/db/types/db';
import { AiEmbeddings, PageEmbeddings } from '@docmost/db/types/embeddings.types';
import { ExpertInsights } from '@docmost/db/types/expert-insights.types';

export interface DbInterface extends DB {
  pageEmbeddings: PageEmbeddings;
  aiEmbeddings: AiEmbeddings;
  expertInsights: ExpertInsights;
}

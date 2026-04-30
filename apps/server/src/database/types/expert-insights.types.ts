import { Json, Timestamp, Generated } from '@docmost/db/types/db';

export type ExpertInsightType =
  | 'warning'
  | 'correction'
  | 'notice'
  | 'recommendation';

export type ExpertInsightStatus = 'draft' | 'published' | 'retired';

export interface ExpertInsights {
  id: Generated<string>;
  workspaceId: string;
  spaceId: string;
  pageId: string;
  insightType: ExpertInsightType;
  status: Generated<ExpertInsightStatus>;
  title: string;
  body: string;
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: Timestamp | null;
  expiresAt: Timestamp | null;
  retiredAt: Timestamp | null;
  spanAnchor: Json | null;
  /** Generated tsvector — read-only. */
  tsv: string | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  deletedAt: Timestamp | null;
}

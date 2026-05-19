import { Json, Timestamp, Generated } from '@docmost/db/types/db';

export type ExpertInsightType =
  | 'warning'
  | 'correction'
  | 'notice'
  | 'recommendation';

export type ExpertInsightStatus = 'draft' | 'published' | 'retired';

export type ExpertInsightConfidence = 'low' | 'medium' | 'high';

export type ExpertInsightVoteKind = 'helpful' | 'not_helpful';

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
  authorName: string | null;
  authorRole: string | null;
  authorDepartment: string | null;
  confidence: Generated<ExpertInsightConfidence>;
  helpfulCount: Generated<number>;
  notHelpfulCount: Generated<number>;
  /** Generated tsvector — read-only. */
  tsv: Generated<string | null>;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
  deletedAt: Timestamp | null;
}

export interface ExpertInsightVotes {
  id: Generated<string>;
  insightId: string;
  userId: string;
  vote: ExpertInsightVoteKind;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
}

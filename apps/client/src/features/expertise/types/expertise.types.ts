export type InsightType = "warning" | "correction" | "notice" | "recommendation";
export type InsightStatus = "draft" | "published" | "retired";
export type InsightConfidence = "low" | "medium" | "high";
export type InsightVote = "helpful" | "not_helpful";

export interface IInsight {
  id: string;
  workspaceId: string;
  spaceId: string;
  pageId: string;
  insightType: InsightType;
  status: InsightStatus;
  title: string;
  body: string;
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  retiredAt: string | null;
  authorName: string | null;
  authorRole: string | null;
  authorDepartment: string | null;
  confidence: InsightConfidence;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: string;
  updatedAt: string;
}

/** A row of the workspace-wide directory (POST /insights/search). */
export interface IInsightSearchItem extends IInsight {
  pageTitle: string | null;
  pageSlugId: string;
  spaceName: string;
  spaceSlug: string;
  myVote: InsightVote | null;
  canManage: boolean;
}

export interface IInsightInput {
  insightType: InsightType;
  title: string;
  body: string;
  confidence?: InsightConfidence;
  expiresAt?: string | null;
}

export interface IInsightVoteResult {
  insightId: string;
  myVote: InsightVote | null;
  helpfulCount: number;
  notHelpfulCount: number;
}

export type HealthIssueCategory =
  | "outdated"
  | "missing-owner"
  | "unverified-critical"
  | "weak-content"
  | "broken-links";

export interface ISignalBreakdown {
  freshness: number;
  ownership: number;
  verification: number | null;
  contentStrength: number;
}

export interface ISpaceScoreSummary {
  spaceId: string;
  spaceName: string | null;
  spaceSlug: string;
  isCritical: boolean;
  score: number | null;
  pageCount: number;
  insufficientData: boolean;
}

export interface IHealthScore {
  score: number | null;
  pageCount: number;
  scoredPageCount: number;
  signals: ISignalBreakdown;
  insufficientData: boolean;
}

export interface IWorkspaceHealth extends IHealthScore {
  spaces: ISpaceScoreSummary[];
}

export interface IHealthIssue {
  pageId: string;
  pageSlugId: string;
  pageTitle: string | null;
  spaceId: string;
  spaceName: string | null;
  spaceSlug: string;
  category: HealthIssueCategory;
  severity: "low" | "medium" | "high";
  detail: string;
}

export interface IHealthIssuesPage {
  items: IHealthIssue[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface IHealthIssuesQuery {
  category: HealthIssueCategory;
  spaceId?: string;
  page?: number;
  limit?: number;
}

export interface IHealthTrendPoint {
  capturedAt: string;
  score: number | null;
}

export interface IHealthTrendResponse {
  points: IHealthTrendPoint[];
}

export interface IHealthTrendQuery {
  spaceId?: string;
  days?: number;
}

export interface IHealthAlert {
  id: string;
  spaceId: string | null;
  threshold: number;
  lastFiredAt: string | null;
  createdAt: string;
}

export interface IHealthAlertsResponse {
  items: IHealthAlert[];
}

export interface IHealthAlertSubscribeInput {
  spaceId?: string;
  threshold: number;
}

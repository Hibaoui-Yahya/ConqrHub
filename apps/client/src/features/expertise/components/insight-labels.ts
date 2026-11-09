import {
  InsightConfidence,
  InsightStatus,
  InsightType,
} from "../types/expertise.types";

/** English source strings; the UI translates them with t(). */
export const INSIGHT_TYPE_LABELS: Record<InsightType, string> = {
  notice: "Notice",
  recommendation: "Recommendation",
  warning: "Warning",
  correction: "Correction",
};

export const INSIGHT_TYPE_COLORS: Record<InsightType, string> = {
  notice: "blue",
  recommendation: "teal",
  warning: "orange",
  correction: "red",
};

export const CONFIDENCE_LABELS: Record<InsightConfidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export const STATUS_LABELS: Record<InsightStatus, string> = {
  draft: "Draft",
  published: "Published",
  retired: "Retired",
};

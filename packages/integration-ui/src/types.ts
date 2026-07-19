// Canonical cross-product presentation contract (blueprint §8.6). Shared by
// ConqrHub and the Plane fork so a resolved object renders identically in both.

export type ResolutionState =
  | "live"
  | "stale"
  | "restricted"
  | "not_found"
  | "deleted"
  | "source_unavailable"
  | "integration_disabled";

export interface SmartObjectAction {
  id: string;
  label: string;
  allowed: boolean;
}

export interface PresentationModel {
  urn: string;
  state: ResolutionState;
  title?: string;
  fields?: Record<string, unknown>;
  deepLink?: string;
  actions?: SmartObjectAction[];
  sourceVersion?: string;
  lastRefreshedAt?: string;
}

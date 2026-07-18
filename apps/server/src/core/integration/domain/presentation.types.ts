/**
 * Smart Object Resolver contract (blueprint §8.6).
 *
 *   resolve(urn, viewer, display_mode, locale) -> authorized presentation model
 *
 * The presentation model contains ONLY fields the viewer is allowed to see,
 * plus the actions they may take and freshness metadata. UIs render from this
 * instead of embedding source-specific payloads.
 */

export enum ResolutionState {
  /** Resolved live from source or a current projection. */
  Live = 'live',
  /** Cached authorized snapshot; include lastUpdated. */
  Stale = 'stale',
  /** Viewer cannot access the object — leak no metadata. */
  Restricted = 'restricted',
  /** Never existed / outside the tenant. */
  NotFound = 'not_found',
  /** Tombstone visible to authorized viewers. */
  Deleted = 'deleted',
  /** No safe snapshot exists and source is unreachable. */
  SourceUnavailable = 'source_unavailable',
  /** Mapping or entitlement absent. */
  IntegrationDisabled = 'integration_disabled',
}

export type DisplayMode =
  | 'pill'
  | 'card'
  | 'table'
  | 'list'
  | 'count'
  | 'progress'
  | 'board'
  | 'timeline';

export interface SmartObjectAction {
  /** Stable action id, e.g. "open", "comment", "transition". */
  id: string;
  label: string;
  /** Whether the viewer is permitted; UI must not enable a forbidden action. */
  allowed: boolean;
}

export interface PresentationModel {
  urn: string;
  state: ResolutionState;
  /** Present only when state is live/stale/deleted. */
  title?: string;
  /** Type-specific summary fields the viewer may see (state, assignee, …). */
  fields?: Record<string, unknown>;
  /** Deep link back into the owning product, preserving return context. */
  deepLink?: string;
  actions?: SmartObjectAction[];
  /** ISO timestamp of the source version this model reflects. */
  sourceVersion?: string;
  /** ISO timestamp of the last successful refresh (for stale display). */
  lastRefreshedAt?: string;
}

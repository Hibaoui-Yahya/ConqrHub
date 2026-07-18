/**
 * Versioned, CloudEvents-like envelope (blueprint §8.4).
 *
 * Product events are normalized into this shape and persisted to the
 * integration outbox atomically with the domain change, then published. Every
 * envelope carries correlation/causation IDs so audit trails connect across
 * services, and payloads hold only minimal authorized metadata (consumers fetch
 * details through APIs).
 */

export interface ConqrEventEnvelope<T = Record<string, unknown>> {
  specversion: '1.0';
  /** e.g. conqr.plane.work-item.updated.v1 */
  type: string;
  /** Emitting component, e.g. "plane-adapter" | "hub". */
  source: string;
  /** URN of the subject the event is about. */
  subject: string;
  tenantId: string;
  /** ISO 8601. */
  time: string;
  id: string;
  correlationId: string;
  causationId?: string;
  actorId?: string;
  data: T;
}

/** Well-known event types (kept additive; breaking changes bump the version). */
export const EventType = {
  RelationshipCreated: 'conqr.integration.relationship.created.v1',
  RelationshipRemoved: 'conqr.integration.relationship.removed.v1',
  MappingChanged: 'conqr.integration.project-space-mapping.changed.v1',
  PlaneWorkItemUpdated: 'conqr.plane.work-item.updated.v1',
  PlaneWorkItemDeleted: 'conqr.plane.work-item.deleted.v1',
  PlaneWebhookReceived: 'conqr.plane.webhook.received.v1',
  // Lifecycle automation — suggestions requiring human approval (§6.3, §6.4).
  RetroSuggested: 'conqr.lifecycle.retro.suggested.v1',
  ReleaseNotesSuggested: 'conqr.lifecycle.release-notes.suggested.v1',
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

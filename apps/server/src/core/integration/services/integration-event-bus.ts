import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter } from 'rxjs';

export interface IntegrationBusEvent {
  workspaceId: string;
  type: string;
  subject: string;
  data?: Record<string, unknown>;
}

/**
 * In-memory pub/sub for pushing refresh events to connected clients over SSE
 * (blueprint §8.4). The durable record of every event is still the outbox
 * (`integration_events`); this bus is a best-effort live signal so smart objects
 * refresh without polling. Not a replacement for the outbox/reconciliation.
 */
@Injectable()
export class IntegrationEventBus {
  private readonly subject = new Subject<IntegrationBusEvent>();

  publish(event: IntegrationBusEvent): void {
    this.subject.next(event);
  }

  /** Stream of events for a single workspace (tenant-filtered). */
  streamForWorkspace(workspaceId: string): Observable<IntegrationBusEvent> {
    return this.subject
      .asObservable()
      .pipe(filter((e) => e.workspaceId === workspaceId));
  }
}

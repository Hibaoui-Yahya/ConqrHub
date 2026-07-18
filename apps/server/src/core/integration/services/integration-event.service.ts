import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IntegrationEventRepo } from '@docmost/db/repos/integration/integration-event.repo';
import { KyselyTransaction } from '@docmost/db/types/kysely.types';
import { IntegrationEvent } from '@docmost/db/types/entity.types';
import { IntegrationEventBus } from './integration-event-bus';

export interface RecordEventInput {
  workspaceId: string;
  type: string;
  source: string;
  subject: string;
  actorId?: string | null;
  correlationId?: string;
  causationId?: string | null;
  data?: Record<string, unknown>;
}

/**
 * Writes CloudEvents-like envelopes to the integration outbox/audit trail
 * (blueprint §8.4, §9.5). When called with a transaction it is persisted
 * atomically with the domain change, giving at-least-once publish semantics.
 */
@Injectable()
export class IntegrationEventService {
  constructor(
    private readonly events: IntegrationEventRepo,
    private readonly bus: IntegrationEventBus,
  ) {}

  async record(
    input: RecordEventInput,
    trx?: KyselyTransaction,
  ): Promise<IntegrationEvent> {
    const correlationId = input.correlationId ?? randomUUID();
    const row = await this.events.append(
      {
        workspaceId: input.workspaceId,
        type: input.type,
        source: input.source,
        subject: input.subject,
        correlationId,
        causationId: input.causationId ?? null,
        actorId: input.actorId ?? null,
        data: (input.data ?? {}) as any,
        status: 'pending',
      },
      trx,
    );
    // Best-effort live push (durable record is the outbox row above).
    this.bus.publish({
      workspaceId: input.workspaceId,
      type: input.type,
      subject: input.subject,
      data: input.data,
    });
    return row;
  }

  auditTimeline(workspaceId: string, correlationId: string) {
    return this.events.findByCorrelation(workspaceId, correlationId);
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { randomUUID } from 'node:crypto';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { RelationshipRepo } from '@docmost/db/repos/integration/relationship.repo';
import { IntegrationRelationship } from '@docmost/db/types/entity.types';
import {
  inverseOf,
  isRelationType,
  RelationshipLifecycle,
  RelationType,
} from '../domain/relationship-types';
import { parseUrn } from '../domain/urn.util';
import { IntegrationEventService } from './integration-event.service';
import { EventType } from '../domain/event-envelope';

export interface CreateRelationshipInput {
  workspaceId: string;
  actorId: string;
  sourceUrn: string;
  targetUrn: string;
  relationType: string;
  provenance?: string;
  sourceVersion?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Optional caller-supplied correlation id to tie into a larger workflow. */
  correlationId?: string;
}

@Injectable()
export class RelationshipService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly relationships: RelationshipRepo,
    private readonly events: IntegrationEventService,
  ) {}

  /**
   * Idempotent typed-relationship creation (blueprint §8.2). Re-issuing the
   * same edge returns the existing row instead of creating a duplicate, and the
   * relationship + audit event are written in one transaction.
   */
  async create(
    input: CreateRelationshipInput,
  ): Promise<IntegrationRelationship> {
    const source = this.parseOrThrow(input.sourceUrn, 'sourceUrn');
    const target = this.parseOrThrow(input.targetUrn, 'targetUrn');

    if (!isRelationType(input.relationType)) {
      throw new BadRequestException(
        `Unknown relation type: ${input.relationType}`,
      );
    }
    if (source.urn === target.urn) {
      throw new BadRequestException('An object cannot relate to itself');
    }

    const relationType = input.relationType as RelationType;
    const inverse = inverseOf(relationType);
    const correlationId = input.correlationId ?? randomUUID();

    return executeTx(this.db, async (trx) => {
      const inserted = await this.relationships.insertIfAbsent(
        {
          workspaceId: input.workspaceId,
          sourceUrn: source.urn,
          sourceType: source.type,
          targetUrn: target.urn,
          targetType: target.type,
          relationType,
          inverseRelationType: inverse,
          lifecycleState: RelationshipLifecycle.Active,
          provenance: input.provenance ?? null,
          createdBy: input.actorId,
          sourceVersion: (input.sourceVersion ?? null) as any,
          metadata: (input.metadata ?? null) as any,
        },
        trx,
      );

      // Conflict → edge already exists; return it without a duplicate event.
      if (!inserted) {
        const existing = await this.relationships.findEdge(
          input.workspaceId,
          source.urn,
          target.urn,
          relationType,
          trx,
        );
        return existing!;
      }

      await this.events.record(
        {
          workspaceId: input.workspaceId,
          type: EventType.RelationshipCreated,
          source: 'hub',
          subject: source.urn,
          actorId: input.actorId,
          correlationId,
          data: {
            relationshipId: inserted.id,
            targetUrn: target.urn,
            relationType,
            provenance: input.provenance ?? null,
          },
        },
        trx,
      );

      return inserted;
    });
  }

  async listForUrn(
    workspaceId: string,
    urn: string,
  ): Promise<IntegrationRelationship[]> {
    this.parseOrThrow(urn, 'urn');
    return this.relationships.findForUrn(workspaceId, urn);
  }

  async remove(
    workspaceId: string,
    id: string,
    actorId: string,
  ): Promise<void> {
    const existing = await this.relationships.findById(id, workspaceId);
    if (!existing) return;

    await executeTx(this.db, async (trx) => {
      await this.relationships.softDelete(
        id,
        workspaceId,
        RelationshipLifecycle.Deleted,
        trx,
      );
      await this.events.record(
        {
          workspaceId,
          type: EventType.RelationshipRemoved,
          source: 'hub',
          subject: existing.sourceUrn,
          actorId,
          data: { relationshipId: id, targetUrn: existing.targetUrn },
        },
        trx,
      );
    });
  }

  private parseOrThrow(urn: string, field: string) {
    try {
      return parseUrn(urn);
    } catch {
      throw new BadRequestException(`Invalid ${field}: ${urn}`);
    }
  }
}

import {
  InsertableIntegrationRelationship,
  IntegrationRelationship,
  UpdatableIntegrationRelationship,
} from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';

@Injectable()
export class RelationshipRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseSelect() {
    return [
      'id',
      'workspaceId',
      'sourceUrn',
      'sourceType',
      'targetUrn',
      'targetType',
      'relationType',
      'inverseRelationType',
      'lifecycleState',
      'provenance',
      'createdBy',
      'sourceVersion',
      'metadata',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ] as const;
  }

  async findById(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationRelationship | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationRelationships')
      .select(this.baseSelect())
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async findEdge(
    workspaceId: string,
    sourceUrn: string,
    targetUrn: string,
    relationType: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationRelationship | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationRelationships')
      .select(this.baseSelect())
      .where('workspaceId', '=', workspaceId)
      .where('sourceUrn', '=', sourceUrn)
      .where('targetUrn', '=', targetUrn)
      .where('relationType', '=', relationType)
      .executeTakeFirst();
  }

  /**
   * Idempotent insert: returns the newly created row, or `undefined` if the
   * edge already existed (caller should then fetch it with {@link findEdge}).
   */
  async insertIfAbsent(
    row: InsertableIntegrationRelationship,
    trx?: KyselyTransaction,
  ): Promise<IntegrationRelationship | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('integrationRelationships')
      .values(row)
      .onConflict((oc) =>
        oc
          .columns(['workspaceId', 'sourceUrn', 'targetUrn', 'relationType'])
          .doNothing(),
      )
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * All edges touching a URN, in EITHER direction, active by default.
   * Used for backlink/knowledge panels and traceability queries.
   */
  async findForUrn(
    workspaceId: string,
    urn: string,
    opts: { includeDeleted?: boolean } = {},
    trx?: KyselyTransaction,
  ): Promise<IntegrationRelationship[]> {
    const db = dbOrTx(this.db, trx);
    let q = db
      .selectFrom('integrationRelationships')
      .select(this.baseSelect())
      .where('workspaceId', '=', workspaceId)
      .where((eb) =>
        eb.or([eb('sourceUrn', '=', urn), eb('targetUrn', '=', urn)]),
      );
    if (!opts.includeDeleted) {
      q = q.where('deletedAt', 'is', null);
    }
    return q.orderBy('createdAt', 'desc').execute();
  }

  /**
   * All active edges touching a URN across ALL tenants. Used by the webhook
   * processor, which receives a Plane object with no workspace context and must
   * find every workspace that linked it. Callers must re-scope any follow-up
   * work by the returned `workspaceId`.
   */
  async findByUrnAnyWorkspace(
    urn: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationRelationship[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationRelationships')
      .select(this.baseSelect())
      .where((eb) =>
        eb.or([eb('sourceUrn', '=', urn), eb('targetUrn', '=', urn)]),
      )
      .where('deletedAt', 'is', null)
      .execute();
  }

  async update(
    patch: UpdatableIntegrationRelationship,
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('integrationRelationships')
      .set({ ...patch, updatedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  /** Soft delete — the edge becomes orphaned/deleted, never hard-removed here. */
  async softDelete(
    id: string,
    workspaceId: string,
    lifecycleState: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('integrationRelationships')
      .set({ deletedAt: new Date(), lifecycleState, updatedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}

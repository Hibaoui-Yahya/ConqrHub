import {
  InsertableIntegrationProjectSpaceMapping,
  IntegrationProjectSpaceMapping,
} from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';

@Injectable()
export class ProjectSpaceMappingRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private cols() {
    return [
      'id',
      'workspaceId',
      'planeProjectId',
      'spaceId',
      'mappingKind',
      'createdBy',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ] as const;
  }

  async listForProject(
    workspaceId: string,
    planeProjectId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationProjectSpaceMapping[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationProjectSpaceMappings')
      .select(this.cols())
      .where('workspaceId', '=', workspaceId)
      .where('planeProjectId', '=', planeProjectId)
      .where('deletedAt', 'is', null)
      .execute();
  }

  async listForSpace(
    workspaceId: string,
    spaceId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationProjectSpaceMapping[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationProjectSpaceMappings')
      .select(this.cols())
      .where('workspaceId', '=', workspaceId)
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .execute();
  }

  async listForWorkspace(
    workspaceId: string,
    limit = 50,
    trx?: KyselyTransaction,
  ): Promise<IntegrationProjectSpaceMapping[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationProjectSpaceMappings')
      .select(this.cols())
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .limit(limit)
      .execute();
  }

  /**
   * The single mapping a work item's embeddings are scoped to: the earliest
   * primary mapping for the project across all Hub workspaces (secondary
   * mappings are used only when no primary exists).
   */
  async findPrimaryForProjectAnyWorkspace(
    planeProjectId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationProjectSpaceMapping | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationProjectSpaceMappings')
      .select(this.cols())
      .where('planeProjectId', '=', planeProjectId)
      .where('deletedAt', 'is', null)
      .orderBy(
        sql`case when mapping_kind = 'primary' then 0 else 1 end`,
        'asc',
      )
      .orderBy('createdAt', 'asc')
      .executeTakeFirst();
  }

  /** Primary mappings for a project across ALL workspaces (webhook has no tenant). */
  async findPrimaryByProjectAnyWorkspace(
    planeProjectId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationProjectSpaceMapping[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationProjectSpaceMappings')
      .select(this.cols())
      .where('planeProjectId', '=', planeProjectId)
      .where('mappingKind', '=', 'primary')
      .where('deletedAt', 'is', null)
      .execute();
  }

  async getPrimaryForProject(
    workspaceId: string,
    planeProjectId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationProjectSpaceMapping | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationProjectSpaceMappings')
      .select(this.cols())
      .where('workspaceId', '=', workspaceId)
      .where('planeProjectId', '=', planeProjectId)
      .where('mappingKind', '=', 'primary')
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async insertIfAbsent(
    row: InsertableIntegrationProjectSpaceMapping,
    trx?: KyselyTransaction,
  ): Promise<IntegrationProjectSpaceMapping | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('integrationProjectSpaceMappings')
      .values(row)
      .onConflict((oc) =>
        oc
          .columns(['workspaceId', 'planeProjectId', 'spaceId'])
          .doUpdateSet({ mappingKind: row.mappingKind, deletedAt: null }),
      )
      .returningAll()
      .executeTakeFirst();
  }

  async softDelete(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('integrationProjectSpaceMappings')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}

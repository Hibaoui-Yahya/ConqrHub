import {
  InsertableIntegrationRequirement,
  IntegrationRequirement,
} from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';

@Injectable()
export class RequirementRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private cols() {
    return [
      'id',
      'workspaceId',
      'pageId',
      'blockId',
      'title',
      'state',
      'createdBy',
      'createdAt',
      'updatedAt',
    ] as const;
  }

  async findById(
    id: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationRequirement | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationRequirements')
      .select(this.cols())
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  /** Create the requirement if the (page, block) is new, else return existing. */
  async upsert(
    row: InsertableIntegrationRequirement,
    trx?: KyselyTransaction,
  ): Promise<IntegrationRequirement | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('integrationRequirements')
      .values(row)
      .onConflict((oc) =>
        oc
          .columns(['workspaceId', 'pageId', 'blockId'])
          .doUpdateSet({ title: row.title }),
      )
      .returningAll()
      .executeTakeFirst();
  }

  async listForPage(
    workspaceId: string,
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationRequirement[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationRequirements')
      .select(this.cols())
      .where('workspaceId', '=', workspaceId)
      .where('pageId', '=', pageId)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  async listByState(
    workspaceId: string,
    state: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationRequirement[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationRequirements')
      .select(this.cols())
      .where('workspaceId', '=', workspaceId)
      .where('state', '=', state)
      .execute();
  }

  async updateState(
    id: string,
    workspaceId: string,
    state: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('integrationRequirements')
      .set({ state, updatedAt: new Date() })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}

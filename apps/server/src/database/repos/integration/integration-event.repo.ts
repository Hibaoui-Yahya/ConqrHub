import {
  InsertableIntegrationEvent,
  IntegrationEvent,
} from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';

/**
 * Outbox + cross-product audit trail. Events are written in the SAME
 * transaction as the domain change (blueprint §8.4) and published afterwards.
 */
@Injectable()
export class IntegrationEventRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async append(
    row: InsertableIntegrationEvent,
    trx?: KyselyTransaction,
  ): Promise<IntegrationEvent> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('integrationEvents')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findByCorrelation(
    workspaceId: string,
    correlationId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationEvent[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationEvents')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('correlationId', '=', correlationId)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  /** Recent events for a workspace, newest first (bell "Suite" feed, §5.3C). */
  async findRecentByWorkspace(
    workspaceId: string,
    limit = 200,
    trx?: KyselyTransaction,
  ): Promise<IntegrationEvent[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationEvents')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
  }

  async listPending(
    limit = 100,
    trx?: KyselyTransaction,
  ): Promise<IntegrationEvent[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationEvents')
      .selectAll()
      .where('status', '=', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .execute();
  }

  async markPublished(id: string, trx?: KyselyTransaction): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('integrationEvents')
      .set({ status: 'published', publishedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }
}

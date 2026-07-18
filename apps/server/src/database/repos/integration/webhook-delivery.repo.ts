import {
  InsertableIntegrationWebhookDelivery,
  IntegrationWebhookDelivery,
} from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';

@Injectable()
export class WebhookDeliveryRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * Records a delivery. Returns the row if it was newly inserted, or
   * `undefined` if this (source, delivery_id) was already seen — the caller
   * treats `undefined` as a duplicate and skips reprocessing (inbox dedup).
   */
  async recordIfNew(
    row: InsertableIntegrationWebhookDelivery,
    trx?: KyselyTransaction,
  ): Promise<IntegrationWebhookDelivery | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('integrationWebhookDeliveries')
      .values(row)
      .onConflict((oc) => oc.columns(['source', 'deliveryId']).doNothing())
      .returningAll()
      .executeTakeFirst();
  }

  async findByDeliveryId(
    source: string,
    deliveryId: string,
    trx?: KyselyTransaction,
  ): Promise<IntegrationWebhookDelivery | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationWebhookDeliveries')
      .selectAll()
      .where('source', '=', source)
      .where('deliveryId', '=', deliveryId)
      .executeTakeFirst();
  }

  async markProcessed(
    id: string,
    status: string,
    error?: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('integrationWebhookDeliveries')
      .set({ status, error: error ?? null, processedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async setParsed(
    id: string,
    subject: string | null,
    action: string | null,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('integrationWebhookDeliveries')
      .set({ subject, action })
      .where('id', '=', id)
      .execute();
  }

  async listDeadLettered(
    limit = 100,
    trx?: KyselyTransaction,
  ): Promise<IntegrationWebhookDelivery[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('integrationWebhookDeliveries')
      .selectAll()
      .where('status', '=', 'dead_letter')
      .orderBy('receivedAt', 'desc')
      .limit(limit)
      .execute();
  }

  async incrementAttempts(
    id: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const db = dbOrTx(this.db, trx);
    const row = await db
      .updateTable('integrationWebhookDeliveries')
      .set((eb) => ({ attempts: eb('attempts', '+', 1) }))
      .where('id', '=', id)
      .returning('attempts')
      .executeTakeFirst();
    return row?.attempts ?? 0;
  }

  /** Reset a dead-lettered/failed delivery so it can be replayed (§10). */
  async resetForReplay(
    id: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('integrationWebhookDeliveries')
      .set({ status: 'received', error: null, processedAt: null })
      .where('id', '=', id)
      .execute();
  }
}

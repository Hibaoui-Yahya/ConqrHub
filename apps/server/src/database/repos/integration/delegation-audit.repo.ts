import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  DelegationAudit,
  InsertableDelegationAudit,
} from '@docmost/db/types/entity.types';

/**
 * Append-only record of every delegated request, accepted or refused.
 *
 * Refusals are the more valuable half. An accepted call leaves traces
 * everywhere else in the system; a refused one leaves none, so without this
 * table "another product has been trying to act as somebody for a week" is
 * invisible.
 *
 * The token is never written, in any form — not the raw assertion, not a hash
 * of it. What is written is its `jti`, its issuer and its key id, which is
 * enough to join a row to the issuer's own audit trail and useless to anyone
 * who captures it. A table that outlives the incident it was written for is
 * the worst possible place for a live bearer credential.
 */
@Injectable()
export class DelegationAuditRepo {
  private readonly logger = new Logger(DelegationAuditRepo.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async append(
    row: InsertableDelegationAudit,
    trx?: KyselyTransaction,
  ): Promise<DelegationAudit> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('suiteDelegationAudit')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Record without letting the record fail the request.
   *
   * Deliberate, and only for this direction. On a *refusal* the request is
   * already being rejected, so a failed audit write must not turn a clean 401
   * into a 500 that hides why. On acceptance the caller writes through
   * `append` inside the request's own path, so a failure there is visible.
   */
  async appendQuietly(row: InsertableDelegationAudit): Promise<void> {
    try {
      await this.append(row);
    } catch (err) {
      this.logger.error(
        `Failed to record delegation audit (${row.reason ?? 'accepted'}): ${
          (err as Error).message
        }`,
      );
    }
  }

  async findRecentByWorkspace(
    workspaceId: string,
    limit = 100,
  ): Promise<DelegationAudit[]> {
    return this.db
      .selectFrom('suiteDelegationAudit')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
  }
}

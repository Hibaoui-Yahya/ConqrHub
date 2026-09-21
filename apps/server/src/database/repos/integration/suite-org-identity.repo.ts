import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  InsertableSuiteOrgIdentity,
  SuiteOrgIdentityRow,
} from '@docmost/db/types/entity.types';

/**
 * Which ConqrHub workspace an identity provider's organisation *is*.
 *
 * One row per organisation, not per person: the provider already holds the
 * people, and this only has to answer the tenant question. That keeps the
 * table small enough to be administered by hand, which matters because
 * creating a row here grants another product the ability to act inside a
 * workspace and should be a deliberate act rather than a side effect of
 * somebody signing in.
 *
 * Nothing here derives an organisation from a workspace. The direction is
 * one-way on purpose — a suite product sends the organisation its own token
 * carried, and this resolves it.
 */
@Injectable()
export class SuiteOrgIdentityRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * The active mapping for a provider organisation, or undefined.
   *
   * `is_active` is filtered here rather than by the caller so there is no way
   * to read a revoked mapping by accident. A revoked organisation and an
   * unknown one are the same answer to a caller, which is correct: both mean
   * "this organisation may not act here", and distinguishing them in a refusal
   * would tell an unauthenticated caller which organisations exist.
   */
  async findActive(
    idpKey: string,
    externalOrgId: string,
    trx?: KyselyTransaction,
  ): Promise<SuiteOrgIdentityRow | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('suiteOrgIdentity')
      .selectAll()
      .where('idpKey', '=', idpKey)
      .where('externalOrgId', '=', externalOrgId)
      .where('isActive', '=', true)
      .executeTakeFirst();
  }

  async upsert(
    row: InsertableSuiteOrgIdentity,
    trx?: KyselyTransaction,
  ): Promise<SuiteOrgIdentityRow> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('suiteOrgIdentity')
      .values(row)
      .onConflict((oc) =>
        oc.constraint('suite_org_identity_external_unique').doUpdateSet({
          workspaceId: row.workspaceId,
          isActive: row.isActive ?? true,
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}

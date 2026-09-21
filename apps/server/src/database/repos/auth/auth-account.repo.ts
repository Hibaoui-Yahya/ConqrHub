import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { AuthAccount } from '@docmost/db/types/entity.types';

/**
 * The link between a person in an identity provider and a user in ConqrHub.
 *
 * `auth_accounts` has existed since SSO landed and was, until now, written by
 * nothing — the OIDC login computed the provider subject and threw it away,
 * matching on email instead. That is the gap this repo closes. An email can be
 * reassigned, so an email match lets whoever can set an address decide which
 * person in another product they become; a provider subject cannot be, which
 * is exactly why it is the join key for cross-product delegation.
 *
 * Every read here is scoped to a workspace. A subject is unique within a
 * provider, but the *user* it names is a workspace-local row, so resolving one
 * without a workspace would be asking a question with more than one answer.
 */
@Injectable()
export class AuthAccountRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * The account for a provider subject inside one workspace, or undefined.
   *
   * Soft-deleted rows are excluded, matching the partial unique index: a
   * removed account must not resolve, and must not block the same person being
   * linked again.
   */
  async findByProviderSubject(
    idpKey: string,
    providerUserId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<AuthAccount | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('authAccounts')
      .selectAll()
      .where('idpKey', '=', idpKey)
      .where('providerUserId', '=', providerUserId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  /**
   * Record that this subject is this user, idempotently.
   *
   * Written on every login rather than only on the first, so a deployment that
   * adopts the shared IdP after its users already exist acquires their links
   * as they sign in, with no backfill and no guessing.
   *
   * The conflict target is the partial unique index, which is what makes a
   * concurrent second login a no-op instead of a duplicate row. The subject is
   * never *moved* to another user: `user_id` is deliberately left out of the
   * update set, so a subject already bound stays bound, and a mismatch is a
   * problem an operator resolves rather than one a login silently rewrites.
   */
  async link(
    row: {
      userId: string;
      workspaceId: string;
      idpKey: string;
      providerUserId: string;
    },
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .insertInto('authAccounts')
      .values({
        userId: row.userId,
        workspaceId: row.workspaceId,
        idpKey: row.idpKey,
        providerUserId: row.providerUserId,
      })
      .onConflict((oc) =>
        oc
          .columns(['workspaceId', 'idpKey', 'providerUserId'])
          .where('idpKey', 'is not', null)
          .where('deletedAt', 'is', null)
          .doUpdateSet({ updatedAt: new Date() }),
      )
      .execute();
  }
}

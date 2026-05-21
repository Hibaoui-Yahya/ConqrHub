import {
  InsertableUserSession,
  UserSession,
} from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';

@Injectable()
export class UserSessionRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insertSession(
    session: InsertableUserSession,
    trx?: KyselyTransaction,
  ): Promise<UserSession> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('userSessions')
      .values(session)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findActiveById(id: string): Promise<UserSession | undefined> {
    return this.db
      .selectFrom('userSessions')
      .selectAll()
      .where('id', '=', id)
      .where('expiresAt', '>', new Date())
      .where('revokedAt', 'is', null)
      .executeTakeFirst();
  }

  async findActiveByUser(
    userId: string,
    workspaceId: string,
  ): Promise<UserSession[]> {
    return this.db
      .selectFrom('userSessions')
      .selectAll()
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('expiresAt', '>', new Date())
      .where('revokedAt', 'is', null)
      .orderBy('lastActiveAt', 'desc')
      .execute();
  }

  async updateLastActiveAt(id: string): Promise<void> {
    await this.db
      .updateTable('userSessions')
      .set({ lastActiveAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async revokeById(
    id: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.db
      .updateTable('userSessions')
      .set({ revokedAt: new Date() })
      .where('id', '=', id)
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .execute();
  }

  async revokeAllExceptCurrent(
    currentSessionId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.db
      .updateTable('userSessions')
      .set({ revokedAt: new Date() })
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('id', '!=', currentSessionId)
      .where('revokedAt', 'is', null)
      .execute();
  }

  async revokeByUserId(
    userId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('userSessions')
      .set({ revokedAt: new Date() })
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('revokedAt', 'is', null)
      .execute();
  }

  async deleteByUserId(
    userId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .deleteFrom('userSessions')
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async deleteAllExceptCurrent(
    currentSessionId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.db
      .deleteFrom('userSessions')
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('id', '!=', currentSessionId)
      .execute();
  }

  async deleteStale(retentionDays: number): Promise<void> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    await this.db
      .deleteFrom('userSessions')
      .where((eb) =>
        eb.or([
          eb('revokedAt', '<', cutoff),
          eb('expiresAt', '<', cutoff),
        ]),
      )
      .execute();
  }

  async trimExcessSessions(maxPerUser: number): Promise<void> {
    // Single-statement window-function delete: rank each user's sessions
    // by last_active_at DESC and drop everything past `maxPerUser`. Previous
    // implementation was O(N) round-trips (one DELETE per overflowed user)
    // and could exhaust the connection pool on workspaces with many users.
    await sql`
      DELETE FROM user_sessions
      WHERE id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY user_id, workspace_id
              ORDER BY last_active_at DESC
            ) AS rn
          FROM user_sessions
        ) ranked
        WHERE ranked.rn > ${maxPerUser}
      )
    `.execute(this.db);
  }
}

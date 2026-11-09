import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

/**
 * Persistence of suite IdP token families (migration
 * 20261016T100000-suite-token-families). Lock order everywhere is
 * users → user_sessions → suite_token_families (ADR-HM-001 v3 §3); the
 * triggers that enforce invariant I1 follow the same order.
 */

export interface FamilyForRequest {
  state: string;
  expiresAt: Date;
  hubSessionId: string | null;
  userId: string;
  workspaceId: string;
  clientId: string;
  userDisabled: boolean;
}

export type RotateResult =
  | { status: 'rotated'; userId: string; workspaceId: string; expiresAt: Date }
  | {
      status: 'reused';
      userId: string;
      workspaceId: string;
      expiresAt: Date;
      currentJti: string;
    }
  | { status: 'invalid' }
  | { status: 'replay' };

export interface RotateInput {
  familyId: string;
  clientId: string;
  presentedJti: string;
  newJti: string;
  /** Constrained idempotent retry (ADR-HM-001 v3 §4): 0 = strict rotation. */
  reuseWindowSeconds: number;
  maxReuse: number;
}

export type EndSessionResult =
  | {
      result: 'ended' | 'already_ended';
      userId: string;
      workspaceId: string;
      hubSessionId: string | null;
    }
  | { result: 'unknown' };

@Injectable()
export class SuiteTokenFamilyRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * O1 — creates a family for a live Hub session. Locks the user and the
   * session FOR SHARE so a concurrent logout, revocation or deactivation
   * either completes first (and this returns null) or waits until the family
   * exists and then revokes it through the trigger. Never outlives the session.
   */
  async createForSession(input: {
    userId: string;
    workspaceId: string;
    clientId: string;
    hubSessionId: string;
    currentJti: string;
    maxLifetimeSeconds: number;
  }): Promise<{ id: string; expiresAt: Date } | null> {
    return this.db.transaction().execute(async (trx) => {
      const user = await trx
        .selectFrom('users')
        .select(['id', 'deactivatedAt', 'deletedAt'])
        .where('id', '=', input.userId)
        .where('workspaceId', '=', input.workspaceId)
        .forShare()
        .executeTakeFirst();
      if (!user || user.deactivatedAt || user.deletedAt) return null;

      const session = await trx
        .selectFrom('userSessions')
        .select(['id', 'expiresAt'])
        .where('id', '=', input.hubSessionId)
        .where('userId', '=', input.userId)
        .where('workspaceId', '=', input.workspaceId)
        .where('revokedAt', 'is', null)
        .where('expiresAt', '>', sql<Date>`now()`)
        .forShare()
        .executeTakeFirst();
      if (!session) return null;

      const family = await trx
        .insertInto('suiteTokenFamilies')
        .values({
          workspaceId: input.workspaceId,
          userId: input.userId,
          clientId: input.clientId,
          hubSessionId: input.hubSessionId,
          currentJti: input.currentJti,
          expiresAt: sql<Date>`least(${session.expiresAt}::timestamptz, now() + make_interval(secs => ${input.maxLifetimeSeconds}))`,
        })
        .returning(['id', 'expiresAt'])
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('suiteSessionEvents')
        .values({
          workspaceId: input.workspaceId,
          userId: input.userId,
          clientId: input.clientId,
          familyId: family.id,
          hubSessionId: input.hubSessionId,
          event: 'family_created',
        })
        .execute();

      return { id: family.id, expiresAt: new Date(family.expiresAt as any) };
    });
  }

  /**
   * O2 — refresh rotation. Fast path: one compare-and-set UPDATE on the
   * family row (the serialization point every revocation also writes, I1).
   * Slow path (the presented token is not the current one, or the family is
   * no longer live): a transaction holding the family row lock decides
   * between the constrained retry, a refusal, and replay detection.
   */
  async rotate(input: RotateInput): Promise<RotateResult> {
    const fast = await sql<{
      userId: string;
      workspaceId: string;
      expiresAt: Date;
    }>`
      UPDATE suite_token_families f
         SET previous_jti = f.current_jti,
             current_jti = ${input.newJti},
             rotated_at = now(),
             rotation_count = f.rotation_count + 1,
             reuse_count = 0
       WHERE f.id = ${input.familyId}
         AND f.client_id = ${input.clientId}
         AND f.state = 'active'
         AND f.hub_session_id IS NOT NULL
         AND f.expires_at > now()
         AND f.current_jti = ${input.presentedJti}
         AND EXISTS (SELECT 1 FROM user_sessions s
                      WHERE s.id = f.hub_session_id
                        AND s.revoked_at IS NULL AND s.expires_at > now())
         AND EXISTS (SELECT 1 FROM users u
                      WHERE u.id = f.user_id
                        AND u.deactivated_at IS NULL AND u.deleted_at IS NULL)
      RETURNING f.user_id, f.workspace_id, f.expires_at
    `.execute(this.db);
    const row = fast.rows[0];
    if (row) {
      return {
        status: 'rotated',
        userId: row.userId,
        workspaceId: row.workspaceId,
        expiresAt: new Date(row.expiresAt),
      };
    }
    return this.db.transaction().execute(async (trx) => {
      const found = await sql<{
        clientId: string;
        state: string;
        currentJti: string;
        previousJti: string | null;
        rotatedAt: Date | null;
        reuseCount: number;
        expiresAt: Date;
        userId: string;
        workspaceId: string;
        hubSessionId: string | null;
        live: boolean;
        secondsSinceRotation: number | null;
      }>`
        SELECT f.client_id, f.state, f.current_jti, f.previous_jti, f.rotated_at,
               f.reuse_count, f.expires_at, f.user_id, f.workspace_id,
               f.hub_session_id,
               (f.state = 'active' AND f.hub_session_id IS NOT NULL
                 AND f.expires_at > now()
                 AND EXISTS (SELECT 1 FROM user_sessions s
                              WHERE s.id = f.hub_session_id
                                AND s.revoked_at IS NULL AND s.expires_at > now())
                 AND EXISTS (SELECT 1 FROM users u
                              WHERE u.id = f.user_id
                                AND u.deactivated_at IS NULL
                                AND u.deleted_at IS NULL)) AS live,
               extract(epoch FROM now() - f.rotated_at)::float8 AS seconds_since_rotation
          FROM suite_token_families f
         WHERE f.id = ${input.familyId}
         FOR UPDATE OF f
      `.execute(trx);
      const f = found.rows[0];
      if (!f || f.clientId !== input.clientId || !f.live) {
        return { status: 'invalid' as const };
      }

      if (input.presentedJti === f.currentJti) {
        // The fast path lost a race with nothing that changed liveness;
        // rotate under the lock.
        await sql`
          UPDATE suite_token_families
             SET previous_jti = current_jti, current_jti = ${input.newJti},
                 rotated_at = now(), rotation_count = rotation_count + 1,
                 reuse_count = 0
           WHERE id = ${input.familyId}
        `.execute(trx);
        return {
          status: 'rotated' as const,
          userId: f.userId,
          workspaceId: f.workspaceId,
          expiresAt: new Date(f.expiresAt),
        };
      }

      const withinWindow =
        input.reuseWindowSeconds > 0 &&
        input.presentedJti === f.previousJti &&
        f.secondsSinceRotation !== null &&
        f.secondsSinceRotation <= input.reuseWindowSeconds &&
        f.reuseCount < input.maxReuse;
      if (withinWindow) {
        await sql`
          UPDATE suite_token_families SET reuse_count = reuse_count + 1
           WHERE id = ${input.familyId}
        `.execute(trx);
        await this.event(trx, f, input.familyId, 'refresh_reuse_window', null, {
          secondsSinceRotation: f.secondsSinceRotation,
        });
        return {
          status: 'reused' as const,
          userId: f.userId,
          workspaceId: f.workspaceId,
          expiresAt: new Date(f.expiresAt),
          currentJti: f.currentJti,
        };
      }

      // Any other presented token of this family is a replay: revoke the
      // whole family (RFC 9700 §4.14.2) and keep the evidence.
      await sql`
        UPDATE suite_token_families
           SET state = 'revoked', revoked_at = now(), revoked_reason = 'replay_detected'
         WHERE id = ${input.familyId}
      `.execute(trx);
      await this.event(
        trx,
        f,
        input.familyId,
        'refresh_replay_detected',
        'replay_detected',
        {
          presented:
            input.presentedJti === f.previousJti ? 'previous' : 'older',
          secondsSinceRotation: f.secondsSinceRotation,
        },
      );
      return { status: 'replay' as const };
    });
  }

  /** O7 — the per-request liveness read for a suite access token. */
  async findForRequest(
    familyId: string,
  ): Promise<FamilyForRequest | undefined> {
    const result = await sql<FamilyForRequest>`
      SELECT f.state, f.expires_at, f.hub_session_id, f.user_id,
             f.workspace_id, f.client_id,
             (u.deactivated_at IS NOT NULL OR u.deleted_at IS NOT NULL) AS user_disabled
        FROM suite_token_families f
        JOIN users u ON u.id = f.user_id
       WHERE f.id = ${familyId}
    `.execute(this.db);
    const row = result.rows[0];
    return row ? { ...row, expiresAt: new Date(row.expiresAt) } : undefined;
  }

  /**
   * Ends the Hub session behind a family (Hub–Meet unified logout). Revokes
   * the session row first — the trigger then revokes every family of that
   * session, any client — so the lock order stays sessions → families.
   * Idempotent: an already ended session or family answers `already_ended`.
   */
  async endSessionForFamily(
    familyId: string,
    clientId: string,
  ): Promise<EndSessionResult> {
    return this.db.transaction().execute(async (trx) => {
      const f = await trx
        .selectFrom('suiteTokenFamilies')
        .select(['clientId', 'userId', 'workspaceId', 'hubSessionId', 'state'])
        .where('id', '=', familyId)
        .executeTakeFirst();
      if (!f || f.clientId !== clientId) return { result: 'unknown' as const };

      let ended = false;
      if (f.hubSessionId) {
        const revoked = await trx
          .updateTable('userSessions')
          .set({ revokedAt: sql`now()` })
          .where('id', '=', f.hubSessionId)
          .where('revokedAt', 'is', null)
          .returning('id')
          .executeTakeFirst();
        ended = Boolean(revoked);
      }
      // A family whose session row is gone (or was ended without the
      // trigger seeing this family) is revoked directly.
      const direct = await trx
        .updateTable('suiteTokenFamilies')
        .set({
          state: 'revoked',
          revokedAt: sql`now()`,
          revokedReason: 'session_end_requested',
        })
        .where('id', '=', familyId)
        .where('state', '=', 'active')
        .returning('id')
        .executeTakeFirst();
      ended = ended || Boolean(direct);

      await trx
        .insertInto('suiteSessionEvents')
        .values({
          workspaceId: f.workspaceId,
          userId: f.userId,
          clientId,
          familyId,
          hubSessionId: f.hubSessionId,
          event: ended ? 'session_end_requested' : 'session_end_repeated',
        })
        .execute();

      return {
        result: ended ? ('ended' as const) : ('already_ended' as const),
        userId: f.userId,
        workspaceId: f.workspaceId,
        hubSessionId: f.hubSessionId,
      };
    });
  }

  /** Retention: drops dead families after `familyDays`, events after `eventDays`. */
  async purge(familyDays: number, eventDays: number): Promise<void> {
    await sql`
      DELETE FROM suite_token_families
       WHERE expires_at < now() - make_interval(days => ${familyDays})
          OR revoked_at < now() - make_interval(days => ${familyDays})
    `.execute(this.db);
    await sql`
      DELETE FROM suite_session_events
       WHERE occurred_at < now() - make_interval(days => ${eventDays})
    `.execute(this.db);
  }

  private async event(
    trx: any,
    f: {
      workspaceId: string;
      userId: string;
      clientId: string;
      hubSessionId: string | null;
    },
    familyId: string,
    event: string,
    reason: string | null,
    detail: Record<string, unknown>,
  ) {
    await trx
      .insertInto('suiteSessionEvents')
      .values({
        workspaceId: f.workspaceId,
        userId: f.userId,
        clientId: f.clientId,
        familyId,
        hubSessionId: f.hubSessionId,
        event,
        reason,
        detail: sql`${JSON.stringify(detail)}::text::jsonb`,
      })
      .execute();
  }
}

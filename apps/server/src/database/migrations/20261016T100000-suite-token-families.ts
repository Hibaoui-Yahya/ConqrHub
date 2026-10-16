import { Kysely, sql } from 'kysely';

/**
 * Durable, revocable state for the suite IdP's tokens (ADR-HM-001 v3).
 *
 * A token family is one sign-in of a suite client (ConqrMeet, …) through the
 * Hub: every refresh and access token it receives carries the family id, and
 * a token is only honoured while its family is `active`. The family is tied
 * to the Hub session that authorized it, so ending that session — logout,
 * device revocation, password change or reset, user deactivation — ends the
 * client's tokens too, including access tokens already issued.
 *
 * Invariant I1 is enforced HERE, not by callers: any transaction that
 * revokes or deletes a Hub session, or disables a user, revokes the affected
 * families in the same transaction (triggers below). Code paths that predate
 * this table (session cleanup, password reset, deactivation) are covered
 * without change.
 *
 * Revoked families are kept (with the Hub session reference set to NULL when
 * the session row is deleted) and every lifecycle event is appended to
 * suite_session_events, which has no foreign keys so the audit trail survives
 * the cascades. Additive only: nothing existing is altered.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS suite_token_families (
      id uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
      workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id varchar(128) NOT NULL,
      hub_session_id uuid REFERENCES user_sessions(id) ON DELETE SET NULL,
      state varchar(16) NOT NULL DEFAULT 'active'
        CHECK (state IN ('active', 'revoked')),
      current_jti uuid NOT NULL,
      previous_jti uuid,
      rotated_at timestamptz,
      rotation_count integer NOT NULL DEFAULT 0,
      reuse_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      revoked_reason varchar(64)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_suite_token_families_session_active
      ON suite_token_families (hub_session_id) WHERE state = 'active'
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_suite_token_families_user_active
      ON suite_token_families (user_id, workspace_id) WHERE state = 'active'
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_suite_token_families_expires
      ON suite_token_families (expires_at)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS suite_session_events (
      id bigserial PRIMARY KEY,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      workspace_id uuid,
      user_id uuid,
      client_id varchar(128),
      family_id uuid,
      hub_session_id uuid,
      event varchar(48) NOT NULL,
      reason varchar(64),
      detail jsonb
    )
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_suite_session_events_occurred
      ON suite_session_events (occurred_at)
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_suite_session_events_family
      ON suite_session_events (family_id)
  `.execute(db);

  // Revokes the active families matching a predicate, locking them in id
  // order (I5) so two concurrent revocations of overlapping sets cannot
  // deadlock, and records one event per family.
  await sql`
    CREATE OR REPLACE FUNCTION suite_revoke_families(
      p_session_id uuid, p_user_id uuid, p_reason text
    ) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      WITH targets AS (
        SELECT id FROM suite_token_families
        WHERE state = 'active'
          AND ((p_session_id IS NOT NULL AND hub_session_id = p_session_id)
            OR (p_user_id IS NOT NULL AND user_id = p_user_id))
        ORDER BY id
        FOR UPDATE
      ), revoked AS (
        UPDATE suite_token_families f
           SET state = 'revoked', revoked_at = now(), revoked_reason = p_reason
          FROM targets t
         WHERE f.id = t.id
        RETURNING f.id, f.workspace_id, f.user_id, f.client_id, f.hub_session_id
      )
      INSERT INTO suite_session_events
        (workspace_id, user_id, client_id, family_id, hub_session_id, event, reason)
      SELECT workspace_id, user_id, client_id, id, hub_session_id,
             'family_revoked', p_reason
        FROM revoked;
    END;
    $$
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION suite_on_session_revoked() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
        PERFORM suite_revoke_families(NEW.id, NULL, 'session_revoked');
      END IF;
      RETURN NEW;
    END;
    $$
  `.execute(db);
  await sql`
    CREATE OR REPLACE FUNCTION suite_on_session_deleted() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM suite_revoke_families(OLD.id, NULL, 'session_deleted');
      RETURN OLD;
    END;
    $$
  `.execute(db);
  await sql`
    CREATE OR REPLACE FUNCTION suite_on_user_disabled() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF (OLD.deactivated_at IS NULL AND NEW.deactivated_at IS NOT NULL)
         OR (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
        PERFORM suite_revoke_families(NULL, NEW.id, 'user_disabled');
      END IF;
      RETURN NEW;
    END;
    $$
  `.execute(db);

  await sql`DROP TRIGGER IF EXISTS trg_suite_session_revoked ON user_sessions`.execute(
    db,
  );
  await sql`
    CREATE TRIGGER trg_suite_session_revoked
      AFTER UPDATE OF revoked_at ON user_sessions
      FOR EACH ROW EXECUTE FUNCTION suite_on_session_revoked()
  `.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_suite_session_deleted ON user_sessions`.execute(
    db,
  );
  await sql`
    CREATE TRIGGER trg_suite_session_deleted
      BEFORE DELETE ON user_sessions
      FOR EACH ROW EXECUTE FUNCTION suite_on_session_deleted()
  `.execute(db);
  await sql`DROP TRIGGER IF EXISTS trg_suite_user_disabled ON users`.execute(
    db,
  );
  await sql`
    CREATE TRIGGER trg_suite_user_disabled
      AFTER UPDATE OF deactivated_at, deleted_at ON users
      FOR EACH ROW EXECUTE FUNCTION suite_on_user_disabled()
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS trg_suite_user_disabled ON users`.execute(
    db,
  );
  await sql`DROP TRIGGER IF EXISTS trg_suite_session_deleted ON user_sessions`.execute(
    db,
  );
  await sql`DROP TRIGGER IF EXISTS trg_suite_session_revoked ON user_sessions`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS suite_on_user_disabled()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS suite_on_session_deleted()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS suite_on_session_revoked()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS suite_revoke_families(uuid, uuid, text)`.execute(
    db,
  );
  await sql`DROP TABLE IF EXISTS suite_session_events`.execute(db);
  await sql`DROP TABLE IF EXISTS suite_token_families`.execute(db);
}

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE workspaces
      ALTER COLUMN audit_retention_days TYPE integer
      USING audit_retention_days::integer
  `.execute(db);

  await sql`
    ALTER TABLE workspaces
      ALTER COLUMN trash_retention_days TYPE integer
      USING trash_retention_days::integer
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE workspaces
      ALTER COLUMN audit_retention_days TYPE bigint
      USING audit_retention_days::bigint
  `.execute(db);

  await sql`
    ALTER TABLE workspaces
      ALTER COLUMN trash_retention_days TYPE bigint
      USING trash_retention_days::bigint
  `.execute(db);
}

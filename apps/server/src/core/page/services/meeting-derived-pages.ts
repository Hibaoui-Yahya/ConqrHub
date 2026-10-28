import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';

/**
 * Hub pages made from a ConqrMeet meeting: a published document
 * (`meeting_documents.page_id`), the meeting page and the transcript page of
 * a published bundle (`meetings.settings.publishedBundle`), and every page
 * under them. Deleted meetings count too: their copies are still meeting
 * content (transcripts, candidate evaluations).
 *
 * LTC Strict Private, phase 0: these pages may hold interview content that
 * the space's members were never meant to read, so nothing deletes them for
 * good — not "delete permanently", not the trash purge, not a space
 * deletion — until the retention and legal-hold review decides. Reading and
 * restoring them is closed with Hub's own page restriction (an operation
 * run separately, ops/ltc/quarantine-meeting-pages.cjs).
 *
 * `meetings.settings` may be a double-encoded jsonb string on older rows;
 * one level of string is unwrapped, as the meeting service does.
 */
export const MEETING_PAGE_RETAINED_MESSAGE =
  'Cette page provient d’une réunion ConqrMeet : sa suppression définitive est suspendue jusqu’à la revue de conservation.';

export async function meetingDerivedPageIdsIn(
  db: KyselyDB | KyselyTransaction,
  opts: { workspaceId: string; underPageId?: string; spaceId?: string },
): Promise<string[]> {
  const scope = opts.underPageId
    ? sql`and p.id in (select id from subtree)`
    : opts.spaceId
      ? sql`and p.space_id = ${opts.spaceId}::uuid`
      : sql``;
  const subtree = opts.underPageId
    ? sql`, subtree as (
        select id from pages where id = ${opts.underPageId}::uuid
        union
        select c.id from pages c join subtree s on c.parent_page_id = s.id
      )`
    : sql``;
  const { rows } = await sql<{ id: string }>`
    with recursive settings_of as (
      select m.id,
        case when jsonb_typeof(m.settings) = 'string'
             then (m.settings #>> '{}')::jsonb
             else m.settings end as s
      from meetings m
      where m.workspace_id = ${opts.workspaceId}::uuid
    ), roots as (
      select md.page_id as id
      from meeting_documents md
      join meetings m on m.id = md.meeting_id
      where m.workspace_id = ${opts.workspaceId}::uuid and md.page_id is not null
      union
      select (s -> 'publishedBundle' ->> 'meetingPageId')::uuid from settings_of
      where s -> 'publishedBundle' ->> 'meetingPageId' ~* '^[0-9a-f-]{36}$'
      union
      select (s -> 'publishedBundle' ->> 'transcriptPageId')::uuid from settings_of
      where s -> 'publishedBundle' ->> 'transcriptPageId' ~* '^[0-9a-f-]{36}$'
    ), derived as (
      select id from roots
      union
      select c.id from pages c join derived d on c.parent_page_id = d.id
    )${subtree}
    select p.id from pages p
    where p.id in (select id from derived)
      and p.workspace_id = ${opts.workspaceId}::uuid
      ${scope}
  `.execute(db);
  return rows.map((r) => r.id);
}

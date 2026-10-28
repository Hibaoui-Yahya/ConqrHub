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
 * `meetings.settings` may be a double-encoded jsonb string on older rows
 * (LTC: 12 of 18 meetings, one level).
 *
 * Deliberately conservative: a page someone files under a meeting page is
 * protected too, and a meeting page moved to another space stays protected
 * (by id). Protection never grants or removes read access; it only blocks
 * permanent deletion.
 */
export const MEETING_PAGE_RETAINED_MESSAGE =
  'Cette page provient d’une réunion ConqrMeet : sa suppression définitive est suspendue jusqu’à la revue de conservation.';

const UUID_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

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
  // Never fails on odd data: a settings string is unwrapped only when it is
  // itself JSON (up to 3 levels, like the meeting service's parseJson), and
  // only well-formed UUIDs are cast. A failure here would stop the trash
  // purge and every permanent deletion of the workspace.
  const { rows } = await sql<{ id: string }>`
    with recursive encoded as (
      select m.id, m.settings as v, 0 as depth
      from meetings m
      where m.workspace_id = ${opts.workspaceId}::uuid
      union all
      select e.id, (e.v #>> '{}')::jsonb, e.depth + 1
      from encoded e
      where jsonb_typeof(e.v) = 'string' and e.depth < 3 and (e.v #>> '{}') is json
    ), settings_of as (
      select v as s from encoded where jsonb_typeof(v) = 'object'
    ), refs as (
      select md.page_id::text as ref
      from meeting_documents md
      join meetings m on m.id = md.meeting_id
      where m.workspace_id = ${opts.workspaceId}::uuid and md.page_id is not null
      union all
      select s -> 'publishedBundle' ->> 'meetingPageId' from settings_of
      union all
      select s -> 'publishedBundle' ->> 'transcriptPageId' from settings_of
    ), roots as (
      select case when ref ~* ${UUID_PATTERN} then ref::uuid end as id from refs
    ), derived as (
      select id from roots where id is not null
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

/*
 * LTC Strict Private, phase 0 — quarantine of Hub pages made from meetings.
 *
 * Restricts every Hub page made from a ConqrMeet meeting (published
 * documents, bundle meeting and transcript pages; deleted meetings included)
 * to the person who created that meeting, with Hub's own page restriction:
 * the same rows PagePermissionService.restrictPage writes (page_access
 * "restricted" + that person as page writer). Hub then hides the page and
 * everything under it from every other member — reading, trash listing,
 * restore, search, RAG, comments, attachments, real-time editing — whatever
 * their workspace or space role. Nothing is deleted.
 *
 * Runs inside the LTC ConqrHub container, fed on stdin:
 *   railway ssh --service ConqrHub --environment client-latetechercheuse -- \
 *     sh -c "echo <base64> | base64 -d | node -"                (dry run)
 *     sh -c "echo <base64> | base64 -d | QUARANTINE_APPLY=yes-ltc node -"
 * Dry run (default): a read-only transaction, prints the plan. Apply: one
 * transaction, idempotent (pages already restricted are left as they are and
 * reported). Prints identifiers and counts only — never titles or content.
 * Refuses to run anywhere but the LTC environment.
 */
// In the LTC container; elsewhere (the test against a disposable database)
// the server's own postgres client, resolved from the working directory.
let postgres;
try {
  postgres = require('/app/apps/server/node_modules/postgres');
} catch {
  postgres = require(require.resolve('postgres', { paths: [process.cwd()] }));
}

const LTC = 'client-latetechercheuse';
const APPLY = process.env.QUARANTINE_APPLY === 'yes-ltc';

if (process.env.RAILWAY_ENVIRONMENT_NAME !== LTC) {
  console.error(`Refused: this operation is for ${LTC} only.`);
  process.exit(2);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 5 });

(async () => {
  const report = { mode: APPLY ? 'apply' : 'dry-run', pages: [] };
  await sql.begin(APPLY ? 'read write' : 'read only', async (tx) => {
    // Roots only: a restriction covers the pages under it.
    const roots = await tx`
      with settings_of as (
        select m.id, m.user_id, m.workspace_id, m.deleted_at,
          case when jsonb_typeof(m.settings) = 'string'
               then (m.settings #>> '{}')::jsonb else m.settings end as s
        from meetings m
      ), refs as (
        select md.page_id as page_id, m.user_id, m.workspace_id, m.deleted_at is not null as meeting_deleted, 'document' as kind
        from meeting_documents md join meetings m on m.id = md.meeting_id
        where md.page_id is not null
        union all
        select (s -> 'publishedBundle' ->> 'meetingPageId')::uuid, user_id, workspace_id, deleted_at is not null, 'bundle-meeting'
        from settings_of where s -> 'publishedBundle' ->> 'meetingPageId' ~* '^[0-9a-f-]{36}$'
        union all
        select (s -> 'publishedBundle' ->> 'transcriptPageId')::uuid, user_id, workspace_id, deleted_at is not null, 'bundle-transcript'
        from settings_of where s -> 'publishedBundle' ->> 'transcriptPageId' ~* '^[0-9a-f-]{36}$'
      )
      select r.page_id, p.space_id, p.workspace_id,
             array_agg(distinct r.user_id) as creators,
             bool_or(r.meeting_deleted) as meeting_deleted,
             string_agg(distinct r.kind, ',') as kinds,
             p.deleted_at is not null as trashed,
             (select pa.id from page_access pa where pa.page_id = p.id) as existing_access
      from refs r join pages p on p.id = r.page_id and p.workspace_id = r.workspace_id
      group by r.page_id, p.id, p.space_id, p.workspace_id, p.deleted_at
      order by r.page_id`;

    for (const root of roots) {
      const entry = {
        pageId: root.page_id,
        kinds: root.kinds,
        trashed: root.trashed,
        meetingDeleted: root.meeting_deleted,
        writers: root.creators.length,
        action: root.existing_access ? 'already-restricted' : 'restrict',
      };
      report.pages.push(entry);
      if (!APPLY || root.existing_access) continue;

      const [access] = await tx`
        insert into page_access (page_id, workspace_id, space_id, access_level, creator_id)
        values (${root.page_id}, ${root.workspace_id}, ${root.space_id}, 'restricted', ${root.creators[0]})
        returning id`;
      for (const userId of root.creators) {
        await tx`
          insert into page_permissions (page_access_id, user_id, role, added_by_id)
          values (${access.id}, ${userId}, 'writer', ${userId})`;
      }
      await tx`
        insert into audit (workspace_id, actor_id, actor_type, event, resource_type, resource_id, space_id, metadata)
        values (${root.workspace_id}, null, 'system', 'page.restricted', 'page', ${root.page_id}, ${root.space_id},
                ${sql.json({ reason: 'ltc-strict-private-phase0-meeting-page-quarantine', meetingDeleted: root.meeting_deleted })})`;
      entry.action = 'restricted';
    }
  });
  report.summary = {
    pages: report.pages.length,
    restricted: report.pages.filter((p) => p.action === 'restricted').length,
    toRestrict: report.pages.filter((p) => p.action === 'restrict').length,
    alreadyRestricted: report.pages.filter((p) => p.action === 'already-restricted').length,
  };
  console.log(JSON.stringify(report, null, 1));
  await sql.end();
})().catch(async (e) => {
  console.error('ERR', e.message);
  try { await sql.end(); } catch {}
  process.exit(1);
});

import { Kysely, CamelCasePlugin, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';

/**
 * ops/ltc/quarantine-meeting-pages.cjs, run the way it would run on LTC
 * (script on stdin), against a disposable migrated database: the dry run
 * changes nothing; the apply restricts each meeting page to the meeting's
 * creator through Hub's own page restriction, so Hub's permission queries
 * hide it from everyone else — Owner and Admin included — and from the
 * trash list; a second apply changes nothing; it refuses other environments.
 */
const dbUrl = process.env.MEETING_TEST_DATABASE_URL;
const suite = dbUrl ? describe : describe.skip;
const SCRIPT = path.resolve(__dirname, '../../../../../../ops/ltc/quarantine-meeting-pages.cjs');

function run(env: Record<string, string>) {
  const out = execFileSync(process.execPath, ['-'], {
    input: require('node:fs').readFileSync(SCRIPT),
    cwd: path.resolve(__dirname, '../../../..'),
    env: { ...process.env, DATABASE_URL: dbUrl!, ...env },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

suite('LTC quarantine of meeting pages', () => {
  let db: Kysely<any>;
  let repo: PagePermissionRepo;
  let ws: string;
  let creator: string;
  let colleague: string;
  let owner: string;
  let space: string;
  let docPage: string;
  let bundlePage: string;
  let childPage: string;
  let ordinary: string;

  beforeAll(async () => {
    db = new Kysely({
      dialect: new PostgresJSDialect({ postgres: (postgres as any)(dbUrl, { max: 3 }) }),
      plugins: [new CamelCasePlugin()],
    });
    repo = new PagePermissionRepo(db as any, {} as any);
    // A clean slate: the operation looks at every meeting of the database.
    await sql`truncate meeting_documents, meetings, page_permissions, page_access cascade`.execute(db);
    ws = randomUUID();
    await db.insertInto('workspaces').values({ id: ws, name: 'LTC' }).execute();
    const user = async (role: string) => {
      const id = randomUUID();
      await db.insertInto('users').values({ id, email: `${id}@example.test`, name: role, role, workspaceId: ws }).execute();
      return id;
    };
    creator = await user('member');
    colleague = await user('member');
    owner = await user('owner');
    space = randomUUID();
    await db.insertInto('spaces').values({ id: space, workspaceId: ws, slug: `g-${space.slice(0, 6)}`, name: 'Général' }).execute();
    const page = async (o: { parent?: string; trashed?: boolean } = {}) => {
      const id = randomUUID();
      await db
        .insertInto('pages')
        .values({ id, slugId: id.slice(0, 10), title: 'x', spaceId: space, workspaceId: ws, parentPageId: o.parent ?? null, deletedAt: o.trashed ? new Date() : null })
        .execute();
      return id;
    };
    docPage = await page({ trashed: true });
    bundlePage = await page();
    childPage = await page({ parent: bundlePage });
    ordinary = await page({ trashed: true });
    const deletedMeeting = randomUUID();
    const liveMeeting = randomUUID();
    await db
      .insertInto('meetings')
      .values([
        { id: deletedMeeting, workspaceId: ws, userId: creator, title: 'Entrevue', status: 'published', deletedAt: new Date() },
        {
          id: liveMeeting,
          workspaceId: ws,
          userId: creator,
          title: 'Point',
          status: 'completed',
          settings: sql`${JSON.stringify({ publishedBundle: { meetingPageId: bundlePage, spaceId: space } })}::jsonb`,
        },
      ])
      .execute();
    await db
      .insertInto('meetingDocuments')
      .values({ meetingId: deletedMeeting, pageId: docPage, templateId: 'generic-meeting', templateVersion: 1, transcriptVersion: 1, title: 'CR', contentMarkdown: 'x', structured: sql`'{}'::jsonb` })
      .execute();
  });
  afterAll(async () => db?.destroy());

  const access = async (userId: string) =>
    Promise.all([docPage, bundlePage, childPage, ordinary].map((id) => repo.canUserAccessPage(userId, id)));

  it('refuses to run outside the LTC environment', () => {
    expect(() => run({ RAILWAY_ENVIRONMENT_NAME: 'production' })).toThrow();
    expect(() => run({ RAILWAY_ENVIRONMENT_NAME: '' })).toThrow();
  });

  it('dry run: reports the two meeting pages and changes nothing', async () => {
    const report = run({ RAILWAY_ENVIRONMENT_NAME: 'client-latetechercheuse' });
    expect(report.mode).toBe('dry-run');
    expect(report.summary).toEqual({ pages: 2, restricted: 0, toRestrict: 2, alreadyRestricted: 0 });
    expect(JSON.stringify(report)).not.toContain('Entrevue');
    expect(await db.selectFrom('pageAccess').selectAll().execute()).toEqual([]);
    expect(await access(colleague)).toEqual([true, true, true, true]);
  });

  it('apply is refused without the reviewed list, or with a list that differs from the plan; nothing is written', async () => {
    const ltc = { RAILWAY_ENVIRONMENT_NAME: 'client-latetechercheuse', QUARANTINE_APPLY: 'yes-ltc' };
    expect(() => run(ltc)).toThrow();
    expect(() => run({ ...ltc, QUARANTINE_EXPECT: docPage })).toThrow();
    // Same number of pages, but not the same pages.
    expect(() => run({ ...ltc, QUARANTINE_EXPECT: [docPage, ordinary].join(',') })).toThrow();
    expect(() => run({ ...ltc, QUARANTINE_EXPECT: [docPage, bundlePage, ordinary].join(',') })).toThrow();
    expect(await db.selectFrom('pageAccess').selectAll().execute()).toEqual([]);
    expect(await db.selectFrom('audit').selectAll().where('workspaceId', '=', ws).execute()).toEqual([]);
  });

  it('apply: only the creator reaches the meeting pages and what is under them; Owner and colleague do not', async () => {
    const plan = run({ RAILWAY_ENVIRONMENT_NAME: 'client-latetechercheuse' });
    expect(plan.expect.split(',').sort()).toEqual([docPage, bundlePage].sort());
    const report = run({
      RAILWAY_ENVIRONMENT_NAME: 'client-latetechercheuse',
      QUARANTINE_APPLY: 'yes-ltc',
      // The list as a person would paste it back: upper case, spaces, any order.
      QUARANTINE_EXPECT: plan.expect.split(',').reverse().map((id: string) => ` ${id.toUpperCase()} `).join(','),
    });
    expect(report.summary).toEqual({ pages: 2, restricted: 2, toRestrict: 0, alreadyRestricted: 0 });
    expect(await access(creator)).toEqual([true, true, true, true]);
    expect(await access(colleague)).toEqual([false, false, false, true]);
    expect(await access(owner)).toEqual([false, false, false, true]);
    // The trash list filters through the same query.
    const visibleTrash = await repo.filterAccessiblePageIds({ pageIds: [docPage, ordinary], userId: owner, spaceId: space } as any);
    expect(visibleTrash).toEqual([ordinary]);
    // Restore, preview (/pages/info) and the restriction routes all decide
    // with canUserEditPage: only the creator may act, whatever the role.
    const edit = (userId: string, pageId: string) => repo.canUserEditPage(userId, pageId);
    for (const pageId of [docPage, bundlePage, childPage]) {
      expect(await edit(owner, pageId)).toEqual({ hasAnyRestriction: true, canAccess: false, canEdit: false });
      expect(await edit(colleague, pageId)).toEqual({ hasAnyRestriction: true, canAccess: false, canEdit: false });
      expect(await edit(creator, pageId)).toEqual({ hasAnyRestriction: true, canAccess: true, canEdit: true });
    }
    expect((await edit(owner, ordinary)).hasAnyRestriction).toBe(false);
    const audits = await db.selectFrom('audit').select(['event', 'resourceId']).where('workspaceId', '=', ws).execute();
    expect(audits.map((a) => a.resourceId).sort()).toEqual([docPage, bundlePage].sort());
    expect(audits.every((a) => a.event === 'page.restricted')).toBe(true);
  });

  it('a second apply changes nothing (the plan is empty, so is the list to approve)', async () => {
    const before = await db.selectFrom('pagePermissions').select(sql<number>`count(*)::int`.as('n')).executeTakeFirst();
    const plan = run({ RAILWAY_ENVIRONMENT_NAME: 'client-latetechercheuse' });
    expect(plan.expect).toBe('');
    const report = run({ RAILWAY_ENVIRONMENT_NAME: 'client-latetechercheuse', QUARANTINE_APPLY: 'yes-ltc' });
    expect(report.summary).toEqual({ pages: 2, restricted: 0, toRestrict: 0, alreadyRestricted: 2 });
    const after = await db.selectFrom('pagePermissions').select(sql<number>`count(*)::int`.as('n')).executeTakeFirst();
    expect(after).toEqual(before);
  });
});

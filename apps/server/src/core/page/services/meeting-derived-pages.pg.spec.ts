import { Kysely, CamelCasePlugin, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import {
  MEETING_PAGE_RETAINED_MESSAGE,
  meetingDerivedPageIdsIn,
} from './meeting-derived-pages';
import { TrashCleanupService } from './trash-cleanup.service';
import { PageService } from './page.service';
import { SpaceService } from '../../space/services/space.service';

// PageService pulls the editor and the real-time collaboration stack (ESM
// only: happy-dom, lib0); forceDelete uses neither.
jest.mock('happy-dom', () => ({ Window: class {} }));
jest.mock('../../../collaboration/collaboration.gateway', () => ({ CollaborationGateway: class {} }));
jest.mock('../../../collaboration/collaboration.util', () => ({}));
jest.mock('../../watcher/watcher.service', () => ({ WatcherService: class {} }));
jest.mock('../../../integrations/storage/storage.service', () => ({ StorageService: class {} }));

/**
 * LTC Strict Private, phase 0: Hub pages made from a meeting are never
 * deleted for good — not "delete permanently", not the trash purge, not a
 * space deletion — until the retention review. Against the real Hub schema
 * (MEETING_TEST_DATABASE_URL, migrated).
 */
const dbUrl = process.env.MEETING_TEST_DATABASE_URL;
const suite = dbUrl ? describe : describe.skip;

suite('meeting-derived Hub pages are retained', () => {
  let db: Kysely<any>;
  let ws: string;
  let otherWs: string;
  let user: string;
  let space: string;
  let emptySpace: string;
  let otherSpace: string;

  const page = async (o: { spaceId?: string; workspaceId?: string; parent?: string | null; trashedDaysAgo?: number } = {}) => {
    const id = randomUUID();
    await db
      .insertInto('pages')
      .values({
        id,
        slugId: id.slice(0, 10),
        title: 'x',
        spaceId: o.spaceId ?? space,
        workspaceId: o.workspaceId ?? ws,
        parentPageId: o.parent ?? null,
        deletedAt: o.trashedDaysAgo == null ? null : new Date(Date.now() - o.trashedDaysAgo * 86_400_000),
      })
      .execute();
    return id;
  };
  const meeting = async (o: { workspaceId?: string; settings?: unknown; doubleEncoded?: boolean; deleted?: boolean } = {}) => {
    const id = randomUUID();
    const json = JSON.stringify(o.settings ?? {});
    await db
      .insertInto('meetings')
      .values({
        id,
        workspaceId: o.workspaceId ?? ws,
        userId: user,
        title: 'Entrevue',
        status: 'completed',
        // A real jsonb object, or (older rows) a JSON string scalar holding
        // it. Bound as text: postgres.js JSON-encodes values bound to ::jsonb.
        settings: o.doubleEncoded ? sql`to_jsonb(${json}::text)` : sql`${json}::text::jsonb`,
        deletedAt: o.deleted ? new Date() : null,
      })
      .execute();
    return id;
  };
  const document = async (meetingId: string, pageId: string) =>
    db
      .insertInto('meetingDocuments')
      .values({
        meetingId,
        pageId,
        templateId: 'generic-meeting',
        templateVersion: 1,
        transcriptVersion: 1,
        title: 'Compte rendu',
        contentMarkdown: 'x',
        structured: sql`'{}'::jsonb`,
      })
      .execute();
  const exists = async (id: string) =>
    !!(await db.selectFrom('pages').select('id').where('id', '=', id).executeTakeFirst());

  beforeAll(async () => {
    db = new Kysely({
      dialect: new PostgresJSDialect({ postgres: (postgres as any)(dbUrl, { max: 3 }) }),
      plugins: [new CamelCasePlugin()],
    });
    ws = randomUUID();
    otherWs = randomUUID();
    await db.insertInto('workspaces').values([{ id: ws, name: 'LTC' }, { id: otherWs, name: 'Autre' }]).execute();
    user = randomUUID();
    await db.insertInto('users').values({ id: user, email: `${user}@example.test`, name: 'R', role: 'member', workspaceId: ws }).execute();
    space = randomUUID();
    emptySpace = randomUUID();
    otherSpace = randomUUID();
    await db
      .insertInto('spaces')
      .values([
        { id: space, workspaceId: ws, slug: `g-${space.slice(0, 6)}`, name: 'Général' },
        { id: emptySpace, workspaceId: ws, slug: `e-${emptySpace.slice(0, 6)}`, name: 'Vide' },
        { id: otherSpace, workspaceId: otherWs, slug: `o-${otherSpace.slice(0, 6)}`, name: 'Autre' },
      ])
      .execute();
  });
  afterAll(async () => db?.destroy());

  it('finds documents, bundle pages (double-encoded too) and pages under them; nothing else', async () => {
    const docPage = await page({ trashedDaysAgo: 40 });
    const deletedMeeting = await meeting({ deleted: true });
    await document(deletedMeeting, docPage);
    const bundlePage = await page();
    const transcriptPage = await page({ parent: bundlePage });
    const childOfTranscript = await page({ parent: transcriptPage });
    await meeting({ settings: { publishedBundle: { meetingPageId: bundlePage, transcriptPageId: transcriptPage, spaceId: space } } });
    const legacyPage = await page();
    await meeting({ doubleEncoded: true, settings: { publishedBundle: { meetingPageId: legacyPage, spaceId: space } } });
    await meeting({ settings: { publishedBundle: { meetingPageId: 'not-a-uuid' } } });
    const unrelated = await page();
    const foreignPage = await page({ spaceId: otherSpace, workspaceId: otherWs });
    await meeting({ workspaceId: otherWs, settings: { publishedBundle: { meetingPageId: foreignPage } } });

    const ids = await meetingDerivedPageIdsIn(db, { workspaceId: ws });
    expect(ids.sort()).toEqual([docPage, bundlePage, transcriptPage, childOfTranscript, legacyPage].sort());
    expect(ids).not.toContain(unrelated);
    expect(ids).not.toContain(foreignPage);

    // Under a page: the page itself, an ancestor of a derived page, or none.
    expect(await meetingDerivedPageIdsIn(db, { workspaceId: ws, underPageId: childOfTranscript })).toEqual([childOfTranscript]);
    const container = await page();
    await db.updateTable('pages').set({ parentPageId: container }).where('id', '=', legacyPage).execute();
    expect(await meetingDerivedPageIdsIn(db, { workspaceId: ws, underPageId: container })).toEqual([legacyPage]);
    expect(await meetingDerivedPageIdsIn(db, { workspaceId: ws, underPageId: unrelated })).toEqual([]);
    // Per space, and never across companies.
    expect((await meetingDerivedPageIdsIn(db, { workspaceId: ws, spaceId: space })).length).toBe(5);
    expect(await meetingDerivedPageIdsIn(db, { workspaceId: ws, spaceId: emptySpace })).toEqual([]);
    expect(await meetingDerivedPageIdsIn(db, { workspaceId: otherWs })).toEqual([foreignPage]);
  });

  it('false negatives: triple-encoded settings, upper-case ids, a meeting page moved to another space', async () => {
    const tripled = await page();
    const once = JSON.stringify({ publishedBundle: { meetingPageId: tripled } });
    // Three levels of string around the object, the most the meeting
    // service's parseJson unwraps. Sent as text: postgres.js would JSON-encode
    // a value bound straight to ::jsonb once more.
    const triple = JSON.stringify(JSON.stringify(JSON.stringify(once)));
    await db
      .insertInto('meetings')
      .values({ id: randomUUID(), workspaceId: ws, userId: user, title: 'x', status: 'completed', settings: sql`${triple}::text::jsonb` })
      .execute();
    const upper = await page();
    await meeting({ settings: { publishedBundle: { transcriptPageId: upper.toUpperCase() } } });
    const elsewhere = randomUUID();
    await db.insertInto('spaces').values({ id: elsewhere, workspaceId: ws, slug: `m-${elsewhere.slice(0, 6)}`, name: 'Ailleurs' }).execute();
    const moved = await page();
    await document(await meeting(), moved);
    await db.updateTable('pages').set({ spaceId: elsewhere }).where('id', '=', moved).execute();

    const ids = await meetingDerivedPageIdsIn(db, { workspaceId: ws });
    expect(ids).toEqual(expect.arrayContaining([tripled, upper, moved]));
    expect(await meetingDerivedPageIdsIn(db, { workspaceId: ws, spaceId: elsewhere })).toEqual([moved]);
  });

  it('false positives and robustness: odd data is ignored, never an error; other companies never match', async () => {
    const ordinary = await page({ trashedDaysAgo: 1 });
    // Odd settings must never break detection (it guards every deletion).
    await meeting({ settings: { publishedBundle: { meetingPageId: '------------------------------------' } } });
    await meeting({ settings: { publishedBundle: { meetingPageId: ordinary + 'x', transcriptPageId: 42 } } });
    await meeting({ settings: { publishedBundle: 'not an object' } });
    await db
      .insertInto('meetings')
      .values({ id: randomUUID(), workspaceId: ws, userId: user, title: 'x', status: 'completed', settings: sql`to_jsonb('not json at all'::text)` })
      .execute();
    // A meeting of this company pointing at another company's page.
    const foreign = await page({ spaceId: otherSpace, workspaceId: otherWs });
    await meeting({ settings: { publishedBundle: { meetingPageId: foreign } } });

    const ids = await meetingDerivedPageIdsIn(db, { workspaceId: ws });
    expect(ids).not.toContain(ordinary);
    expect(ids).not.toContain(foreign);
    expect(await meetingDerivedPageIdsIn(db, { workspaceId: ws, underPageId: ordinary })).toEqual([]);
    expect(await meetingDerivedPageIdsIn(db, { workspaceId: otherWs, underPageId: foreign })).toEqual([]);
  });

  it('deliberately conservative: a page filed under a meeting page is protected too', async () => {
    const meetingPage = await page();
    await document(await meeting(), meetingPage);
    const filedUnder = await page({ parent: meetingPage });
    expect(await meetingDerivedPageIdsIn(db, { workspaceId: ws, underPageId: filedUnder })).toEqual([filedUnder]);
    // Moved out again, it is an ordinary page.
    await db.updateTable('pages').set({ parentPageId: null }).where('id', '=', filedUnder).execute();
    expect(await meetingDerivedPageIdsIn(db, { workspaceId: ws, underPageId: filedUnder })).toEqual([]);
  });

  it('the trash purge skips a meeting page (and a trashed parent holding one) but purges the rest', async () => {
    const meetingPage = await page({ trashedDaysAgo: 45 });
    await document(await meeting({ deleted: true }), meetingPage);
    const parent = await page({ trashedDaysAgo: 45 });
    const child = await page({ parent, trashedDaysAgo: 45 });
    await document(await meeting(), child);
    const ordinary = await page({ trashedDaysAgo: 45 });
    const recent = await page({ trashedDaysAgo: 2 });

    const queue = { add: jest.fn(async () => undefined) };
    await new TrashCleanupService(db as any, queue as any).cleanupOldTrash();

    expect(await exists(meetingPage)).toBe(true);
    expect(await exists(parent)).toBe(true);
    expect(await exists(child)).toBe(true);
    expect(await exists(ordinary)).toBe(false);
    expect(await exists(recent)).toBe(true);
    expect(queue.add).toHaveBeenCalledWith(
      expect.anything(),
      { pageId: ordinary },
      expect.anything(),
    );
  });

  it('"delete permanently" refuses a meeting page and a page holding one, with a 409; others go', async () => {
    const meetingPage = await page({ trashedDaysAgo: 1 });
    await document(await meeting(), meetingPage);
    const holder = await page();
    const held = await page({ parent: holder });
    await meeting({ settings: { publishedBundle: { meetingPageId: held } } });
    const ordinary = await page({ trashedDaysAgo: 1 });

    const service = Object.assign(Object.create(PageService.prototype), {
      db,
      attachmentQueue: { add: jest.fn(async () => undefined) },
      aiQueue: { add: jest.fn(async () => undefined) },
      generalQueue: { add: jest.fn(async () => undefined) },
      eventEmitter: { emit: jest.fn() },
    }) as PageService;
    for (const id of [meetingPage, holder, held]) {
      const err = await service.forceDelete(id, ws).then(() => null, (e) => e);
      expect([id, err?.constructor?.name, err?.message]).toEqual([id, ConflictException.name, MEETING_PAGE_RETAINED_MESSAGE]);
      expect(await exists(id)).toBe(true);
    }
    await service.forceDelete(ordinary, ws);
    expect(await exists(ordinary)).toBe(false);
  });

  it('deleting a space that holds a meeting page is refused with a 409; an empty one is not', async () => {
    const deleteSpace = jest.fn(async () => undefined);
    const service = Object.assign(Object.create(SpaceService.prototype), {
      db,
      spaceRepo: { findById: async (id: string) => ({ id }), deleteSpace },
      attachmentQueue: { add: jest.fn(async () => undefined) },
      auditService: { log: jest.fn() },
    }) as SpaceService;
    const meetingPage = await page();
    await document(await meeting(), meetingPage);

    const err = await service.deleteSpace(space, ws).then(() => null, (e) => e);
    expect([err?.constructor?.name, err?.message]).toEqual([ConflictException.name, MEETING_PAGE_RETAINED_MESSAGE]);
    expect(deleteSpace).not.toHaveBeenCalled();
    await service.deleteSpace(emptySpace, ws);
    expect(deleteSpace).toHaveBeenCalledWith(emptySpace, ws);
  });
});

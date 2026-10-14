/**
 * Real-PostgreSQL security checks for RAG retrieval: stale embedding rows are
 * left in place on purpose (as if cleanup jobs were delayed) and must still
 * never reach a prompt.
 *
 * Skipped unless HUB_PG_TEST_URL points at a disposable database migrated to
 * the latest schema. Never point it at a shared or production database.
 */
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgresModule from 'postgres';
import { randomUUID } from 'node:crypto';
import { RagRetrievalService } from './rag-retrieval.service';
import { RagAccessFilter } from './rag-access.filter';
import { EmbeddingRepository } from '../embeddings/embedding.repository';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { SearchAttachmentsTool } from '../chat/tools/search-attachments.tool';

const postgres: any = (postgresModule as any).default ?? postgresModule;
const URL = process.env.HUB_PG_TEST_URL;
const describePg = URL ? describe : describe.skip;

jest.setTimeout(60_000);

describePg('RAG retrieval access against PostgreSQL', () => {
  let db: Kysely<any>;
  let retrieval: RagRetrievalService;
  let searchTool: SearchAttachmentsTool;
  const otherWs = randomUUID();
  const ws = randomUUID();
  const general = randomUUID();
  const privateSpace = randomUUID();
  const alice = randomUUID(); // coworker
  const bob = randomUUID(); // owner of the restricted page
  const carol = randomUUID(); // in the workspace, member of no space
  const verifiedAt = new Date(Date.now() - 60_000);
  const vector = Array.from({ length: 1024 }, (_, i) => ((i % 5) + 1) / 10);
  const ids: Record<string, string> = {};

  async function page(
    key: string,
    opts: {
      space?: string;
      parent?: string;
      attachments?: string[];
      deleted?: boolean;
      verification?: { status: string; expiresAt?: Date | null } | null;
      text?: string;
    },
  ) {
    const id = randomUUID();
    ids[key] = id;
    await db
      .insertInto('pages')
      .values({
        id,
        slugId: id.slice(0, 10),
        title: key,
        textContent: opts.text ?? `${key} Zebrina`,
        content: {
          type: 'doc',
          content: (opts.attachments ?? []).map((a) => ({
            type: 'attachment',
            attrs: { attachmentId: a },
          })),
        },
        spaceId: opts.space ?? general,
        workspaceId: ws,
        parentPageId: opts.parent ?? null,
        deletedAt: opts.deleted ? new Date() : null,
      })
      .execute();
    const v =
      opts.verification === undefined
        ? { status: 'verified' }
        : opts.verification;
    if (v) {
      await db
        .insertInto('pageVerifications')
        .values({
          pageId: id,
          workspaceId: ws,
          spaceId: opts.space ?? general,
          status: v.status,
          verifiedAt,
          expiresAt: v.expiresAt ?? null,
        })
        .execute();
    }
    return id;
  }

  async function chunk(
    pageId: string,
    spaceId: string,
    index: number,
    text: string,
    extra: Record<string, unknown> = {},
  ) {
    await sql`insert into ai_embeddings (workspace_id, space_id, source_kind, source_id, chunk_index, chunk_text, embedding, model, dim, content_hash, metadata)
      values (${ws}, ${spaceId}, 'page', ${pageId}, ${index}, ${text}, ${`[${vector.join(',')}]`}::vector, 'mistral-embed', 1024, 'h',
              ${JSON.stringify({ pageId, title: 't', spaceId, workspaceId: ws, ...extra })}::text::jsonb)`.execute(
      db,
    );
  }

  async function insight(key: string, pageId: string, status: string) {
    const id = randomUUID();
    ids[key] = id;
    await sql`insert into expert_insights (id, workspace_id, space_id, page_id, insight_type, status, title, body)
      values (${id}, ${ws}, ${general}, ${pageId}, 'recommendation', ${status}::expert_insight_status, ${key}, ${`${key} Zebrina`})`.execute(
      db,
    );
    await sql`insert into ai_embeddings (workspace_id, space_id, source_kind, source_id, chunk_index, chunk_text, embedding, model, dim, content_hash, metadata)
      values (${ws}, ${general}, 'expert_insight', ${id}, 0, ${`${key} Zebrina`}, ${`[${vector.join(',')}]`}::vector, 'mistral-embed', 1024, 'h',
              ${JSON.stringify({ title: key })}::text::jsonb)`.execute(db);
  }

  async function attachment(
    pageId: string,
    opts: { updatedAt?: Date; deleted?: boolean; fileName?: string; workspaceId?: string; spaceId?: string; creatorId?: string } = {},
  ) {
    const id = randomUUID();
    await db
      .insertInto('attachments')
      .values({
        id,
        fileName: opts.fileName ?? 'annexe.pdf',
        filePath: `${opts.workspaceId ?? ws}/files/${id}/annexe.pdf`,
        fileExt: '.pdf',
        type: 'file',
        creatorId: opts.creatorId ?? bob,
        workspaceId: opts.workspaceId ?? ws,
        pageId,
        spaceId: opts.spaceId ?? general,
        deletedAt: opts.deleted ? new Date() : null,
      })
      .execute();
    await sql`update attachments set updated_at = ${opts.updatedAt ?? new Date(verifiedAt.getTime() - 3_600_000)} where id = ${id}`.execute(
      db,
    );
    return id;
  }

  beforeAll(async () => {
    const client = postgres(URL!, { onnotice: () => {} });
    db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: client }),
      plugins: [new CamelCasePlugin()],
    });
    await db.insertInto('workspaces').values({ id: ws, name: 'T' }).execute();
    for (const u of [alice, bob, carol]) {
      await db
        .insertInto('users')
        .values({ id: u, email: `${u}@example.test`, workspaceId: ws })
        .execute();
    }
    await db
      .insertInto('spaces')
      .values({
        id: general,
        slug: `g-${general.slice(0, 8)}`,
        workspaceId: ws,
      })
      .execute();
    await db
      .insertInto('spaces')
      .values({
        id: privateSpace,
        slug: `p-${privateSpace.slice(0, 8)}`,
        workspaceId: ws,
      })
      .execute();
    for (const [u, s] of [
      [alice, general],
      [bob, general],
      [bob, privateSpace],
    ]) {
      await db
        .insertInto('spaceMembers')
        .values({ userId: u, spaceId: s, role: 'writer' })
        .execute();
    }

    // Visible to alice.
    const open = await page('open', {});
    await chunk(open, general, 0, 'Politique ouverte Zebrina');
    // Restricted page in the SAME space: only bob is granted.
    const restricted = await page('restricted', {});
    const access = await db
      .insertInto('pageAccess')
      .values({
        pageId: restricted,
        workspaceId: ws,
        spaceId: general,
        accessLevel: 'restricted',
      })
      .returning('id')
      .executeTakeFirst();
    await db
      .insertInto('pagePermissions')
      .values({ pageAccessId: access.id, userId: bob, role: 'writer' })
      .execute();
    await chunk(restricted, general, 0, 'Salaires confidentiels Zebrina');
    // Child of the restricted page inherits the restriction.
    const child = await page('child', { parent: restricted });
    await chunk(child, general, 0, 'Grille enfant confidentielle Zebrina');
    // Stale rows of pages that are no longer eligible.
    await chunk(
      await page('draft', { verification: { status: 'draft' } }),
      general,
      0,
      'Brouillon Zebrina',
    );
    await chunk(
      await page('never', { verification: null }),
      general,
      0,
      'Jamais vérifiée Zebrina',
    );
    await chunk(
      await page('expired', {
        verification: {
          status: 'verified',
          expiresAt: new Date(Date.now() - 1000),
        },
      }),
      general,
      0,
      'Expirée Zebrina',
    );
    await chunk(
      await page('deleted', { deleted: true }),
      general,
      0,
      'Supprimée Zebrina',
    );
    await chunk(
      await page('private', { space: privateSpace }),
      privateSpace,
      0,
      'Espace privé Zebrina',
    );
    // Attached documents: one valid, one removed from the body, one deleted, one replaced after verification.
    const keep = randomUUID();
    const docPage = await page('docs', { attachments: [keep] });
    await db
      .insertInto('attachments')
      .values({
        id: keep,
        fileName: 'annexe.pdf',
        filePath: `${ws}/files/${keep}/annexe.pdf`,
        fileExt: '.pdf',
        type: 'file',
        creatorId: bob,
        workspaceId: ws,
        pageId: docPage,
        spaceId: general,
      })
      .execute();
    await sql`update attachments set updated_at = ${new Date(verifiedAt.getTime() - 3_600_000)} where id = ${keep}`.execute(
      db,
    );
    const keepVersion = new Date(verifiedAt.getTime() - 3_600_000).toISOString();
    const removed = await attachment(docPage);
    const gone = await attachment(docPage, { deleted: true });
    const replaced = await attachment(docPage, { updatedAt: new Date() });
    // Removed from the body, but its UUID survives in plain text and in a
    // mention: not a document reference.
    const mentioned = await attachment(docPage);
    // Replaced, then the page was re-verified before re-indexing ran: the
    // live file predates the new verification, the chunk is the OLD version.
    const reverified = await attachment(docPage, {
      updatedAt: new Date(verifiedAt.getTime() - 600_000),
    });
    await db
      .updateTable('pages')
      .set({
        content: {
          type: 'doc',
          content: [
            ...[keep, gone, replaced, reverified].map((a) => ({
              type: 'attachment',
              attrs: { attachmentId: a },
            })),
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: `Ancien fichier ${mentioned} retiré` },
                { type: 'mention', attrs: { id: mentioned, label: mentioned } },
              ],
            },
          ],
        },
      })
      .where('id', '=', docPage)
      .execute();
    await chunk(docPage, general, 0, 'Corps de page docs Zebrina');
    await chunk(
      docPage,
      general,
      1,
      '[Attachment: annexe.pdf]\nAnnexe valide Zebrina',
      { attachmentId: keep, attachmentUpdatedAt: keepVersion },
    );
    await chunk(
      docPage,
      general,
      5,
      '[Attachment: annexe.pdf]\nAnnexe mentionnée en texte Zebrina',
      {
        attachmentId: mentioned,
        attachmentUpdatedAt: new Date(verifiedAt.getTime() - 3_600_000).toISOString(),
      },
    );
    await chunk(
      docPage,
      general,
      6,
      '[Attachment: annexe.pdf]\nAncienne version re-vérifiée Zebrina',
      {
        attachmentId: reverified,
        attachmentUpdatedAt: new Date(verifiedAt.getTime() - 7_200_000).toISOString(),
      },
    );
    await chunk(
      docPage,
      general,
      7,
      '[Attachment: annexe.pdf]\nAnnexe sans version Zebrina',
      { attachmentId: keep },
    );
    // Confidential file names: a restricted page in the readable space, a
    // deleted page, and another company.
    await attachment(restricted, { fileName: 'Candidat-Dupont-salaire.pdf' });
    await attachment(ids.deleted, { fileName: 'Candidat-supprime.pdf' });
    const otherSpace = randomUUID();
    const otherPage = randomUUID();
    await db.insertInto('workspaces').values({ id: otherWs, name: 'Autre' }).execute();
    const outsider = randomUUID();
    await db
      .insertInto('users')
      .values({ id: outsider, email: `${outsider}@example.test`, workspaceId: otherWs })
      .execute();
    await db
      .insertInto('spaces')
      .values({ id: otherSpace, slug: `o-${otherSpace.slice(0, 8)}`, workspaceId: otherWs })
      .execute();
    await db
      .insertInto('pages')
      .values({
        id: otherPage,
        slugId: otherPage.slice(0, 10),
        title: 'autre',
        spaceId: otherSpace,
        workspaceId: otherWs,
      })
      .execute();
    await attachment(otherPage, {
      fileName: 'Candidat-externe.pdf',
      workspaceId: otherWs,
      spaceId: otherSpace,
      creatorId: outsider,
    });
    await chunk(
      docPage,
      general,
      2,
      '[Attachment: annexe.pdf]\nAnnexe retirée Zebrina',
      { attachmentId: removed },
    );
    await chunk(
      docPage,
      general,
      3,
      '[Attachment: annexe.pdf]\nAnnexe supprimée Zebrina',
      { attachmentId: gone },
    );
    await chunk(
      docPage,
      general,
      4,
      '[Attachment: annexe.pdf]\nAnnexe remplacée Zebrina',
      { attachmentId: replaced },
    );
    // Expert insights.
    await insight('insight-published', open, 'published');
    await insight('insight-draft', open, 'draft');
    await insight('insight-on-restricted', restricted, 'published');

    const ai = { embed: async () => vector };
    const env = { getAiRagMinScore: () => 0 };
    const repo = new EmbeddingRepository(db as any);
    const access2 = new RagAccessFilter(
      db as any,
      new PagePermissionRepo(db as any, {} as any),
      new SpaceMemberRepo(db as any, {} as any, {} as any),
    );
    retrieval = new RagRetrievalService(ai as any, repo, env as any, access2);
    searchTool = new SearchAttachmentsTool(
      { register: () => undefined } as any,
      db as any,
      new SpaceMemberRepo(db as any, {} as any, {} as any),
      new PagePermissionRepo(db as any, {} as any),
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.deleteFrom('workspaces').where('id', 'in', [ws, otherWs]).execute();
    await db.destroy();
  });

  const ask = (
    userId: string | undefined,
    extra: Record<string, unknown> = {},
  ) =>
    retrieval.retrieve({
      question: 'Zebrina',
      workspaceId: ws,
      topK: 30,
      userId,
      ...extra,
    } as any);

  it('a coworker reads the General page and the valid document, nothing stale or restricted', async () => {
    const ctx = await ask(alice);
    const text = ctx.contextText;
    expect(text).toContain('Politique ouverte Zebrina');
    expect(text).toContain('Annexe valide Zebrina');
    expect(text).toContain('Corps de page docs Zebrina');
    expect(text).toContain('insight-published Zebrina');
    for (const hidden of [
      'Salaires confidentiels',
      'Grille enfant confidentielle',
      'Brouillon',
      'Jamais vérifiée',
      'Expirée',
      'Supprimée Zebrina',
      'Espace privé',
      'Annexe retirée',
      'Annexe supprimée',
      'Annexe remplacée',
      'Annexe mentionnée en texte',
      'Ancienne version re-vérifiée',
      'Annexe sans version',
      'insight-draft',
      'insight-on-restricted',
    ]) {
      expect(text).not.toContain(hidden);
    }
    const sources = new Set(ctx.chunks.map((c) => c.sourceId));
    expect(sources).toEqual(
      new Set([ids.open, ids.docs, ids['insight-published']]),
    );
  });

  it('the granted user reads the restricted page (and its child) in the same space', async () => {
    const text = (await ask(bob)).contextText;
    expect(text).toContain('Salaires confidentiels Zebrina');
    expect(text).toContain('Grille enfant confidentielle Zebrina');
    expect(text).toContain('Espace privé Zebrina');
    expect(text).toContain('insight-on-restricted Zebrina');
  });

  it('a workspace member of no space reads nothing, even with a forged space allow-list', async () => {
    expect((await ask(carol)).chunks).toEqual([]);
    expect((await ask(carol, { spaceIds: [general] })).chunks).toEqual([]);
  });

  it('a caller narrowing to one space never widens access', async () => {
    const ctx = await ask(alice, { spaceId: privateSpace });
    expect(ctx.chunks).toEqual([]);
  });

  it('fails closed without a reader', async () => {
    expect((await ask(undefined)).chunks).toEqual([]);
  });

  it('applies to both vector and lexical paths', async () => {
    const ctx = await ask(alice);
    const lexicalOnly = ctx.chunks.filter((c) =>
      c.matchedBy?.includes('lexical'),
    );
    expect(lexicalOnly.length).toBeGreaterThan(0);
    expect(
      ctx.chunks.every((c) =>
        [ids.open, ids.docs, ids['insight-published']].includes(c.sourceId),
      ),
    ).toBe(true);
  });

  it('search_attachments lists only files the reader can open now', async () => {
    const names = async (userId: string, args: Record<string, unknown>, workspaceId = ws) =>
      ((await searchTool.execute(args as any, { user: { id: userId } as any, workspaceId })) as Array<{ fileName: string }>)
        .map((a) => a.fileName)
        .sort();
    // Restricted page in an otherwise readable space: hidden from the coworker.
    expect(await names(alice, { query: 'Candidat' })).toEqual([]);
    expect(await names(alice, { pageId: ids.restricted })).toEqual([]);
    // The granted user sees it; nobody sees a deleted page's file.
    expect(await names(bob, { query: 'Candidat' })).toEqual(['Candidat-Dupont-salaire.pdf']);
    // Another company never appears, even when asked for by space.
    expect(await names(bob, { query: 'externe' })).toEqual([]);
    // Readable page files stay listed (live, non-deleted only).
    const readable = await names(alice, { query: 'annexe' });
    expect(readable.length).toBeGreaterThan(0);
    expect(readable.every((n) => n === 'annexe.pdf')).toBe(true);
    // A member of no space sees nothing.
    expect(await names(carol, { query: 'a' })).toEqual([]);
  });
});

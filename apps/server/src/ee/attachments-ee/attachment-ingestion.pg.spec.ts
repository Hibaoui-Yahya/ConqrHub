/**
 * Real-PostgreSQL checks for the attachment ingestion SQL (store guards, OCR
 * claim, dedup scoping, transactional indexing, reconciliation queries).
 *
 * Skipped unless HUB_PG_TEST_URL points at a disposable database migrated to
 * the latest schema (`pnpm migration:latest` with DATABASE_URL set to it).
 * Never point it at a shared or production database: it inserts fixtures.
 */
import { CamelCasePlugin, Kysely, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgresModule from 'postgres';
import { randomUUID } from 'node:crypto';
import { AttachmentExtractionStore } from './attachment-extraction.store';
import {
  AttachmentExtractionService,
  EXTRACTOR_VERSION,
} from './attachment-extraction.service';
import { PageAttachmentContentService } from './page-attachment-content.service';
import { AttachmentIngestionReconciler } from './attachment-ingestion.reconciler';
import { EmbeddingIndexerService } from '../ai/embeddings/embedding-indexer.service';
import { EmbeddingRepository } from '../ai/embeddings/embedding.repository';
import { ChunkingService } from '../ai/embeddings/chunking.service';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';

// ts-jest compiles without esModuleInterop: take the callable export either way.
const postgres: any = (postgresModule as any).default ?? postgresModule;

const URL = process.env.HUB_PG_TEST_URL;
const describePg = URL ? describe : describe.skip;

jest.setTimeout(60_000);

describePg('attachment ingestion against PostgreSQL', () => {
  let db: Kysely<any>;
  let client: any;
  const ws = randomUUID();
  const otherWs = randomUUID();
  const space = randomUUID();
  const otherSpace = randomUUID();
  const user = randomUUID();
  const verifiedAt = new Date(Date.now() - 60_000);

  const files = new Map<string, Buffer>();
  const storage = {
    read: async (key: string) => {
      const b = files.get(key);
      if (!b)
        throw Object.assign(new Error('missing'), {
          code: 'STORAGE_OBJECT_NOT_FOUND',
        });
      return b;
    },
  };
  const ai = {
    isAvailable: () => true,
    isOcrAvailable: () => true,
    getEmbeddingDimension: () => 1024,
    ocrDocument: jest.fn(),
    embedMany: jest.fn(async (texts: string[]) =>
      texts.map((t) =>
        Array.from({ length: 1024 }, (_, i) => ((t.length + i) % 7) / 7 + 0.01),
      ),
    ),
  };
  const env = {
    getAiEmbeddingModel: () => 'mistral-embed',
    getAiEmbeddingChunkChars: () => 1600,
    getAiEmbeddingChunkOverlap: () => 200,
    getAiEmbeddingBatchSize: () => 32,
  };
  const queue = { add: jest.fn() };

  let store: AttachmentExtractionStore;
  let extraction: AttachmentExtractionService;
  let content: PageAttachmentContentService;
  let repo: EmbeddingRepository;
  let indexer: EmbeddingIndexerService;

  async function insertPage(
    opts: {
      spaceId?: string;
      workspaceId?: string;
      attachmentIds?: string[];
      text?: string;
    } = {},
  ) {
    const id = randomUUID();
    await db
      .insertInto('pages')
      .values({
        id,
        slugId: id.slice(0, 10),
        title: 'Achats',
        textContent: opts.text ?? 'Toute dépense passe par Marc.',
        // An object, as the collaboration persistence writes it.
        content: {
          type: 'doc',
          content: (opts.attachmentIds ?? []).map((a) => ({
            type: 'attachment',
            attrs: { attachmentId: a },
          })),
        },
        spaceId: opts.spaceId ?? space,
        workspaceId: opts.workspaceId ?? ws,
      })
      .execute();
    return id;
  }

  async function verify(pageId: string, status = 'verified', at = verifiedAt) {
    await db
      .insertInto('pageVerifications')
      .values({
        pageId,
        workspaceId: ws,
        spaceId: space,
        status,
        verifiedAt: at,
      })
      .onConflict((oc) =>
        oc.column('pageId').doUpdateSet({ status, verifiedAt: at }),
      )
      .execute();
  }

  async function insertAttachment(opts: {
    pageId?: string | null;
    workspaceId?: string;
    name?: string;
    body?: string;
    type?: string;
    id?: string;
  }) {
    const id = opts.id ?? randomUUID();
    const workspaceId = opts.workspaceId ?? ws;
    const name = opts.name ?? 'contrat.txt';
    const filePath = `${workspaceId}/files/${id}/${name}`;
    const bytes = Buffer.from(opts.body ?? 'Plafond annuel : 120 000 dollars.');
    files.set(filePath, bytes);
    // created/updated_at come from the DB default now(): microsecond precision.
    const row: any = await db
      .insertInto('attachments')
      .values({
        id,
        fileName: name,
        filePath,
        fileExt: '.' + name.split('.').pop(),
        fileSize: bytes.length,
        type: opts.type ?? 'file',
        creatorId: user,
        workspaceId,
        pageId: opts.pageId ?? null,
        spaceId: space,
      })
      .returningAll()
      .executeTakeFirst();
    // Backdate so the file predates the verification.
    await sql`update attachments set updated_at = ${new Date(verifiedAt.getTime() - 3_600_000)}::timestamptz + interval '123 microseconds' where id = ${id}`.execute(
      db,
    );
    const fresh: any = await db
      .selectFrom('attachments')
      .select('updatedAt')
      .where('id', '=', id)
      .executeTakeFirst();
    return { ...row, updatedAt: fresh.updatedAt } as any;
  }

  beforeAll(async () => {
    client = postgres(URL!, {
      onnotice: () => {},
      types: {
        bigint: {
          to: 20,
          from: [20, 1700],
          serialize: (v: number) => v.toString(),
          parse: (v: string) => Number.parseInt(v),
        },
      } as any,
    });
    db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: client }),
      plugins: [new CamelCasePlugin()],
    });

    for (const w of [ws, otherWs]) {
      await db.insertInto('workspaces').values({ id: w, name: 'T' }).execute();
    }
    await db
      .insertInto('users')
      .values({ id: user, email: `${user}@example.test`, workspaceId: ws })
      .execute();
    await db
      .insertInto('spaces')
      .values({ id: space, slug: `s-${space.slice(0, 8)}`, workspaceId: ws })
      .execute();
    await db
      .insertInto('spaces')
      .values({
        id: otherSpace,
        slug: `o-${otherSpace.slice(0, 8)}`,
        workspaceId: ws,
      })
      .execute();

    store = new AttachmentExtractionStore(db as any);
    extraction = new AttachmentExtractionService(
      store,
      storage as any,
      ai as any,
    );
    content = new PageAttachmentContentService(
      db as any,
      extraction,
      queue as any,
    );
    repo = new EmbeddingRepository(db as any);
    indexer = new EmbeddingIndexerService(
      db as any,
      ai as any,
      env as any,
      new ChunkingService(),
      repo,
      content,
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db
      .deleteFrom('workspaces')
      .where('id', 'in', [ws, otherWs])
      .execute();
    await db.destroy();
  });

  it('store.save honours the microsecond updated_at guard and soft deletes', async () => {
    const att = await insertAttachment({ pageId: await insertPage() });
    const values = {
      status: 'extracted',
      method: 'native',
      sourceSha256: 'a',
      sourceSize: 1,
      sourceUpdatedAt: att.updatedAt,
      textSha256: 't',
      charCount: 4,
      pageCount: null,
      ocrPages: 0,
      attempts: 0,
      lastError: null,
      detail: null,
      extractorVersion: EXTRACTOR_VERSION,
    };
    const lease = { leaseMs: 60_000 };
    expect(await store.save(att as any, values, 'text', lease)).toBe('written');
    expect(await store.loadText(att.id)).toBe('text');
    expect(
      await store.save(
        { ...att, updatedAt: new Date(att.updatedAt.getTime() + 1) } as any,
        values,
        'stale',
        lease,
      ),
    ).toBe('changed');
    await db
      .updateTable('attachments')
      .set({ deletedAt: new Date() })
      .where('id', '=', att.id)
      .execute();
    expect(await store.save(att as any, values, 'deleted', lease)).toBe(
      'changed',
    );
    expect(await store.loadText(att.id)).toBe('text');
  });

  it('store.save drops late OCR results and never clobbers a fresh claim', async () => {
    const att = await insertAttachment({ pageId: await insertPage() });
    const values = {
      status: 'extracted',
      method: 'ocr',
      sourceSha256: 'x',
      sourceSize: 1,
      sourceUpdatedAt: att.updatedAt,
      textSha256: 't',
      charCount: 4,
      pageCount: 1,
      ocrPages: 1,
      attempts: 0,
      lastError: null,
      detail: null,
      extractorVersion: EXTRACTOR_VERSION,
    };
    const claim = {
      sourceSha256: 'x',
      pageCount: 1,
      extractorVersion: EXTRACTOR_VERSION,
    };
    const first = await store.claimOcr(att as any, claim, 60_000);
    expect(first).toEqual(expect.any(String));
    // Abandoned lease taken over by a second worker.
    await sql`update attachment_text_extractions set updated_at = now() - interval '2 hours' where attachment_id = ${att.id}`.execute(
      db,
    );
    const second = await store.claimOcr(att as any, claim, 60_000);
    expect(second).not.toBe(first);
    // A native (non-OCR) write for the same bytes must not clobber the fresh claim.
    expect(
      await store.save(att as any, { ...values, method: 'native' }, 'native', {
        leaseMs: 60_000,
      }),
    ).toBe('busy');
    // The first worker's late result is dropped; the current owner's is stored.
    expect(
      await store.save(att as any, values, 'late text', {
        claimToken: first!,
        leaseMs: 60_000,
      }),
    ).toBe('late');
    expect(
      await store.save(att as any, values, 'owner text', {
        claimToken: second!,
        leaseMs: 60_000,
      }),
    ).toBe('written');
    expect(await store.loadText(att.id)).toBe('owner text');
    // Claim token cleared once stored: the old owner stays rejected.
    expect(
      await store.save(att as any, values, 'late again', {
        claimToken: second!,
        leaseMs: 60_000,
      }),
    ).toBe('late');
  });

  it('a fresh claim on older bytes does not block claiming the replaced file', async () => {
    const att = await insertAttachment({ pageId: await insertPage() });
    const v = EXTRACTOR_VERSION;
    expect(
      await store.claimOcr(
        att as any,
        { sourceSha256: 'old', pageCount: 1, extractorVersion: v },
        60_000,
      ),
    ).toEqual(expect.any(String));
    expect(
      await store.claimOcr(
        att as any,
        { sourceSha256: 'new', pageCount: 1, extractorVersion: v },
        60_000,
      ),
    ).toEqual(expect.any(String));
  });

  it('store.claimOcr grants one fresh lease at a time and recovers abandoned ones', async () => {
    const att = await insertAttachment({ pageId: await insertPage() });
    const claim = {
      sourceSha256: 'x',
      pageCount: 1,
      extractorVersion: EXTRACTOR_VERSION,
    };
    expect(await store.claimOcr(att as any, claim, 60_000)).toEqual(
      expect.any(String),
    );
    expect(await store.claimOcr(att as any, claim, 60_000)).toBeNull();
    await sql`update attachment_text_extractions set updated_at = now() - interval '2 hours' where attachment_id = ${att.id}`.execute(
      db,
    );
    expect(await store.claimOcr(att as any, claim, 60_000)).toEqual(
      expect.any(String),
    );
  });

  it('dedup is scoped to the workspace', async () => {
    const a = await insertAttachment({
      pageId: await insertPage(),
      body: 'identique',
    });
    const b = await insertAttachment({
      pageId: await insertPage(),
      body: 'identique',
    });
    const foreign = await insertAttachment({
      pageId: null,
      workspaceId: otherWs,
      body: 'identique',
    });
    const first = await extraction.ensureExtracted(a as any, {
      allowOcr: false,
    });
    expect(first.status).toBe('extracted');
    expect(
      (await extraction.ensureExtracted(b as any, { allowOcr: false })).reused,
    ).toBe('dedup');
    expect(
      await store.findDuplicate(
        otherWs,
        (await store.findRow(a.id))!.sourceSha256!,
        foreign.id,
        EXTRACTOR_VERSION,
      ),
    ).toBeUndefined();
  });

  it('indexes a verified page with its document; lexical search finds it only in readable spaces', async () => {
    const attId = randomUUID();
    const pageId = await insertPage({ attachmentIds: [attId] });
    await insertAttachment({
      id: attId,
      pageId,
      name: 'Contrat cadre.txt',
      body: 'Le plafond Zephyrine est de 120 000 dollars.',
    });
    await verify(pageId);

    const res = await indexer.indexPage(pageId, ws);
    expect(res).toMatchObject({ status: 'indexed', attachmentsIndexed: 1 });

    const rows = await db
      .selectFrom('aiEmbeddings')
      .select(['chunkText', 'metadata', 'spaceId'])
      .where('sourceId', '=', pageId)
      .orderBy('chunkIndex')
      .execute();
    expect(rows).toHaveLength(2);
    expect(rows[1].chunkText).toBe(
      '[Attachment: Contrat cadre.txt]\nLe plafond Zephyrine est de 120 000 dollars.',
    );
    expect(rows[1].metadata).toMatchObject({
      attachmentId: attId,
      fileName: 'Contrat cadre.txt',
      pageId,
    });

    const hits = await repo.lexicalSearch({
      workspaceId: ws,
      query: 'zéphyrine',
      spaceIds: [space],
    });
    expect(hits.map((h) => h.metadata?.attachmentId)).toContain(attId);
    expect(
      await repo.lexicalSearch({
        workspaceId: ws,
        query: 'zéphyrine',
        spaceIds: [otherSpace],
      }),
    ).toEqual([]);
    expect(
      await repo.lexicalSearch({ workspaceId: otherWs, query: 'zéphyrine' }),
    ).toEqual([]);

    // Re-index: nothing changed, nothing re-embedded.
    ai.embedMany.mockClear();
    expect((await indexer.indexPage(pageId, ws)).status).toBe('skipped');
    expect(ai.embedMany).not.toHaveBeenCalled();

    // Vectors come back from pgvector and can be reused.
    const reusable = await repo.findReusableVectors(
      'page',
      pageId,
      'mistral-embed',
      'Achats',
    );
    expect(reusable.size).toBe(2);
    expect([...reusable.values()][0]).toHaveLength(1024);
  });

  it('drops page and document embeddings when the page is unverified, and excludes files replaced after verification', async () => {
    const attId = randomUUID();
    const pageId = await insertPage({ attachmentIds: [attId] });
    await insertAttachment({ id: attId, pageId, body: 'Clause Quillon.' });
    await verify(pageId);
    await indexer.indexPage(pageId, ws);

    await sql`update attachments set updated_at = now() where id = ${attId}`.execute(
      db,
    );
    await indexer.indexPage(pageId, ws);
    const afterReplace = await db
      .selectFrom('aiEmbeddings')
      .select('metadata')
      .where('sourceId', '=', pageId)
      .execute();
    expect(afterReplace.some((r: any) => r.metadata?.attachmentId)).toBe(false);

    await verify(pageId, 'draft');
    expect((await indexer.indexPage(pageId, ws)).status).toBe('not_verified');
    expect(
      await db
        .selectFrom('aiEmbeddings')
        .select('id')
        .where('sourceId', '=', pageId)
        .execute(),
    ).toEqual([]);
  });

  it('reconciliation finds verified pages with unprocessed documents and stale document embeddings', async () => {
    const reconciler = new AttachmentIngestionReconciler(
      db as any,
      queue as any,
      ai as any,
    );
    const attId = randomUUID();
    const pageId = await insertPage({ attachmentIds: [attId] });
    await insertAttachment({ id: attId, pageId, body: 'Annexe Brindille.' });
    await verify(pageId);

    expect(
      (await reconciler.pagesWithPendingDocuments()).map((r) => r.pageId),
    ).toContain(pageId);
    await indexer.indexPage(pageId, ws);
    expect(
      (await reconciler.pagesWithPendingDocuments()).map((r) => r.pageId),
    ).not.toContain(pageId);

    await db
      .updateTable('attachments')
      .set({ deletedAt: new Date() })
      .where('id', '=', attId)
      .execute();
    const stale = await reconciler.pagesWithStaleAttachmentEmbeddings();
    expect(stale).toContainEqual({ pageId, workspaceId: ws });

    await indexer.indexPage(pageId, ws);
    expect(
      (await reconciler.pagesWithStaleAttachmentEmbeddings()).map(
        (r) => r.pageId,
      ),
    ).not.toContain(pageId);
  });

  it('stores embedding metadata as a JSON object and still reads legacy string rows', async () => {
    const pageId = await insertPage();
    await verify(pageId);
    await indexer.indexPage(pageId, ws);
    const typed = await sql<{
      t: string;
    }>`select jsonb_typeof(metadata) as t from ai_embeddings where source_id = ${pageId}`.execute(
      db,
    );
    expect(typed.rows.map((r) => r.t)).toEqual(['object']);

    // A row as written before the fix: metadata is a JSON string scalar.
    const legacyPage = await insertPage({
      text: 'Ancienne procédure Ornithorynque.',
    });
    const legacyMeta = JSON.stringify({
      pageId: legacyPage,
      title: 'Achats',
      spaceId: space,
      workspaceId: ws,
    });
    await sql`insert into ai_embeddings (workspace_id, space_id, source_kind, source_id, chunk_index, chunk_text, embedding, model, dim, content_hash, metadata)
      values (${ws}, ${space}, 'page', ${legacyPage}, 0, 'Ancienne procédure Ornithorynque.', ${`[${Array(1024).fill(0.1).join(',')}]`}::vector, 'mistral-embed', 1024, 'h', to_jsonb(${legacyMeta}::text))`.execute(
      db,
    );
    expect(
      (
        await sql<{
          t: string;
        }>`select jsonb_typeof(metadata) as t from ai_embeddings where source_id = ${legacyPage}`.execute(
          db,
        )
      ).rows[0].t,
    ).toBe('string');

    const hits = await repo.lexicalSearch({
      workspaceId: ws,
      query: 'ornithorynque',
      spaceIds: [space],
    });
    expect(hits[0].metadata).toMatchObject({
      title: 'Achats',
      pageId: legacyPage,
    });
    expect(
      (
        await repo.findReusableVectors(
          'page',
          legacyPage,
          'mistral-embed',
          'Achats',
        )
      ).size,
    ).toBe(1);

    // Moving the page to another space must update legacy rows too (jsonb_set
    // on a string scalar used to fail, leaving the old space_id in place).
    await repo.reassignSource({
      sourceKind: 'page',
      sourceId: legacyPage,
      workspaceId: ws,
      spaceId: otherSpace,
    });
    const moved: any = await db
      .selectFrom('aiEmbeddings')
      .select(['spaceId', 'metadata'])
      .where('sourceId', '=', legacyPage)
      .executeTakeFirst();
    expect(moved.spaceId).toBe(otherSpace);
    expect(moved.metadata).toMatchObject({
      spaceId: otherSpace,
      title: 'Achats',
    });
    expect(
      await repo.lexicalSearch({
        workspaceId: ws,
        query: 'ornithorynque',
        spaceIds: [space],
      }),
    ).toEqual([]);
  });

  it('read_attachment sees the extraction status and coverage of a document', async () => {
    const att = await insertAttachment({
      pageId: await insertPage(),
      body: 'Note interne',
    });
    await extraction.ensureExtracted(att as any, { allowOcr: false });
    const row = await new AttachmentRepo(db).findByIdWithContent(att.id, ws);
    expect(row).toMatchObject({
      id: att.id,
      textContent: 'Note interne',
      extractionStatus: 'extracted',
      extractionDetail: null,
    });
  });

  it('deleting an attachment row cascades its extraction state', async () => {
    const att = await insertAttachment({ pageId: await insertPage() });
    await extraction.ensureExtracted(att as any, { allowOcr: false });
    await db.deleteFrom('attachments').where('id', '=', att.id).execute();
    expect(await store.findRow(att.id)).toBeUndefined();
  });
});

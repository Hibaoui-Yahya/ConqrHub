import {
  EmbeddingIndexerService,
  StaleIndexInputError,
  attachmentChunkHeader,
  embeddingInput,
  pageContentHashInput,
} from './embedding-indexer.service';
import { ChunkingService } from './chunking.service';
import { AttachmentIndexPart } from '../../attachments-ee/page-attachment-content.service';

const WS = 'ws-1';
const PAGE_ID = 'page-1';
const SPACE = 'space-1';
const VERIFIED_AT = new Date('2026-10-01T12:00:00Z');
const ATT_ID = '0199d0a0-0000-7000-8000-00000000a771';

type Row = Record<string, any> | undefined;

/**
 * DB double: the first read of a table returns `first`, reads inside the
 * pre-write transaction return `inTrx` (defaults to `first`), so a test can
 * change the page or its verification "while" the pass is running.
 */
function makeDb(tables: Record<string, { first: Row; inTrx?: Row }>) {
  const build = (inTrx: boolean) => {
    const chain = (table: string): any => {
      const t = tables[table];
      const row = inTrx && t && 'inTrx' in t ? t.inTrx : t?.first;
      const c: any = {
        select: () => c,
        where: () => c,
        forShare: () => c,
        executeTakeFirst: async () => row,
      };
      return c;
    };
    return { selectFrom: chain };
  };
  const db: any = build(false);
  const trx = build(true);
  db.transaction = () => ({ execute: (fn: (t: any) => any) => fn(trx) });
  return { db, trx };
}

function makeDeps() {
  const ai = {
    isAvailable: jest.fn().mockReturnValue(true),
    getEmbeddingDimension: jest.fn().mockReturnValue(3),
    embedMany: jest.fn(async (texts: string[]) =>
      texts.map((_, i) => [i, 0, 1]),
    ),
  };
  const env = {
    getAiEmbeddingModel: jest.fn().mockReturnValue('mistral-embed'),
    getAiEmbeddingChunkChars: jest.fn().mockReturnValue(1600),
    getAiEmbeddingChunkOverlap: jest.fn().mockReturnValue(200),
    getAiEmbeddingBatchSize: jest.fn().mockReturnValue(32),
  };
  const repo = {
    isContentUnchanged: jest.fn().mockResolvedValue(false),
    upsertChunks: jest.fn().mockResolvedValue(undefined),
    deleteBySource: jest.fn().mockResolvedValue(undefined),
    findReusableVectors: jest.fn().mockResolvedValue(new Map()),
  };
  return { ai, env, repo };
}

const PART: AttachmentIndexPart = {
  attachmentId: ATT_ID,
  fileName: 'Contrat cadre 2026.pdf',
  text: 'Le contrat cadre fixe un plafond annuel de 120 000 dollars.',
  textSha256: 'sha-att-1',
  updatedAt: new Date('2026-09-30T08:00:00Z'),
};

function makeAttachmentContent(
  result: { parts: AttachmentIndexPart[]; pending: boolean } = {
    parts: [PART],
    pending: false,
  },
) {
  return {
    collectForPage: jest.fn().mockResolvedValue(result),
    stillCurrent: jest.fn().mockResolvedValue(true),
    scheduleFollowUp: jest.fn().mockResolvedValue(undefined),
  };
}

const PAGE = {
  id: PAGE_ID,
  title: 'Achats',
  textContent: 'Procédure d’achat : toute dépense passe par Marc.',
  content: {
    type: 'doc',
    content: [{ type: 'attachment', attrs: { attachmentId: ATT_ID } }],
  },
  spaceId: SPACE,
  deletedAt: null,
};
const VERIFIED = {
  status: 'verified',
  expiresAt: null,
  verifiedAt: VERIFIED_AT,
};

function makeSvc(opts: {
  page?: Row;
  pageInTrx?: Row;
  verification?: Row;
  verificationInTrx?: Row;
  attachmentContent?: ReturnType<typeof makeAttachmentContent> | null;
}) {
  const tables: Record<string, { first: Row; inTrx?: Row }> = {
    pages: { first: 'page' in opts ? opts.page : PAGE },
    pageVerifications: {
      first: 'verification' in opts ? opts.verification : VERIFIED,
    },
  };
  if ('pageInTrx' in opts) tables.pages.inTrx = opts.pageInTrx;
  if ('verificationInTrx' in opts) {
    tables.pageVerifications.inTrx = opts.verificationInTrx;
  }
  const { db, trx } = makeDb(tables);
  const deps = makeDeps();
  const attachmentContent =
    opts.attachmentContent === undefined
      ? makeAttachmentContent()
      : opts.attachmentContent;
  const chunking = new ChunkingService();
  const svc = new EmbeddingIndexerService(
    db,
    deps.ai as any,
    deps.env as any,
    chunking,
    deps.repo as any,
    (attachmentContent ?? undefined) as any,
  );
  return { svc, ...deps, attachmentContent, trx, chunking };
}

describe('EmbeddingIndexerService — documents attached to verified pages', () => {
  it('indexes the attachment text under the page source, naming the document', async () => {
    const { svc, repo, attachmentContent } = makeSvc({});

    const res = await svc.indexPage(PAGE_ID, WS);

    expect(res).toMatchObject({ status: 'indexed', attachmentsIndexed: 1 });
    expect(attachmentContent.collectForPage).toHaveBeenCalledWith(
      { id: PAGE_ID, workspaceId: WS, spaceId: SPACE, content: PAGE.content },
      VERIFIED_AT,
    );
    const call = repo.upsertChunks.mock.calls[0][0];
    expect(call).toMatchObject({
      sourceKind: 'page',
      sourceId: PAGE_ID,
      spaceId: SPACE,
    });
    const [pageChunk, attChunk] = call.chunks;
    expect(pageChunk.metadata).toEqual({
      pageId: PAGE_ID,
      title: 'Achats',
      spaceId: SPACE,
      workspaceId: WS,
    });
    expect(attChunk.chunkText).toBe(
      `${attachmentChunkHeader(PART.fileName)}\n${PART.text}`,
    );
    expect(attChunk.metadata).toEqual({
      pageId: PAGE_ID,
      title: 'Achats',
      spaceId: SPACE,
      workspaceId: WS,
      attachmentId: ATT_ID,
      fileName: 'Contrat cadre 2026.pdf',
      // The source version retrieval compares with the live attachment.
      attachmentUpdatedAt: new Date(PART.updatedAt).toISOString(),
      textSha256: PART.textSha256,
    });
    expect(call.chunks.map((c: any) => c.chunkIndex)).toEqual([0, 1]);
  });

  it('never consults attachments (no extraction, no OCR) for a page that is not verified', async () => {
    for (const verification of [
      undefined,
      { status: 'draft', expiresAt: null, verifiedAt: null },
      { status: 'in_approval', expiresAt: null, verifiedAt: null },
      { status: 'obsolete', expiresAt: null, verifiedAt: VERIFIED_AT },
      {
        status: 'verified',
        expiresAt: new Date(Date.now() - 1000),
        verifiedAt: VERIFIED_AT,
      },
    ]) {
      const { svc, repo, attachmentContent } = makeSvc({ verification });
      const res = await svc.indexPage(PAGE_ID, WS);
      expect(res.status).toBe('not_verified');
      expect(attachmentContent.collectForPage).not.toHaveBeenCalled();
      expect(repo.upsertChunks).not.toHaveBeenCalled();
      expect(repo.deleteBySource).toHaveBeenCalledWith('page', PAGE_ID);
    }
  });

  it('indexes a verified page whose only content is an attached document', async () => {
    const { svc, repo } = makeSvc({ page: { ...PAGE, textContent: '' } });
    const res = await svc.indexPage(PAGE_ID, WS);
    expect(res.status).toBe('indexed');
    expect(repo.upsertChunks.mock.calls[0][0].chunks).toHaveLength(1);
  });

  it('stores nothing and removes embeddings if the page is unverified while indexing', async () => {
    const { svc, repo } = makeSvc({
      verificationInTrx: { status: 'draft', expiresAt: null },
    });
    const res = await svc.indexPage(PAGE_ID, WS);
    expect(res.status).toBe('not_verified');
    expect(repo.upsertChunks).not.toHaveBeenCalled();
    expect(repo.deleteBySource).toHaveBeenCalledWith(
      'page',
      PAGE_ID,
      expect.anything(),
    );
  });

  it('stores nothing if the page is deleted while indexing', async () => {
    const { svc, repo } = makeSvc({
      pageInTrx: { spaceId: SPACE, deletedAt: new Date() },
    });
    const res = await svc.indexPage(PAGE_ID, WS);
    expect(res.status).toBe('deleted');
    expect(repo.upsertChunks).not.toHaveBeenCalled();
  });

  it('retries (throws) instead of storing when the page moves or a document changes mid-pass', async () => {
    const moved = makeSvc({
      pageInTrx: { spaceId: 'space-2', deletedAt: null },
    });
    await expect(moved.svc.indexPage(PAGE_ID, WS)).rejects.toBeInstanceOf(
      StaleIndexInputError,
    );
    expect(moved.repo.upsertChunks).not.toHaveBeenCalled();

    const replaced = makeSvc({});
    replaced.attachmentContent.stillCurrent.mockResolvedValue(false);
    await expect(replaced.svc.indexPage(PAGE_ID, WS)).rejects.toBeInstanceOf(
      StaleIndexInputError,
    );
    expect(replaced.repo.upsertChunks).not.toHaveBeenCalled();
    expect(replaced.attachmentContent.stillCurrent).toHaveBeenCalledWith(
      replaced.trx,
      PAGE_ID,
      [PART],
    );
  });

  it('does not store an old version when the page text, title or verification changed mid-pass', async () => {
    for (const pageInTrx of [
      { ...PAGE, textContent: 'Nouvelle procédure' },
      { ...PAGE, title: 'Achats (v2)' },
    ]) {
      const { svc, repo } = makeSvc({ pageInTrx });
      await expect(svc.indexPage(PAGE_ID, WS)).rejects.toBeInstanceOf(
        StaleIndexInputError,
      );
      expect(repo.upsertChunks).not.toHaveBeenCalled();
    }
    const reverified = makeSvc({
      verificationInTrx: {
        ...VERIFIED,
        verifiedAt: new Date('2026-10-02T09:00:00Z'),
      },
    });
    await expect(reverified.svc.indexPage(PAGE_ID, WS)).rejects.toBeInstanceOf(
      StaleIndexInputError,
    );
    expect(reverified.repo.upsertChunks).not.toHaveBeenCalled();
  });

  it('does not store chunks of a document removed from the page body mid-pass', async () => {
    const { svc, repo } = makeSvc({
      pageInTrx: { ...PAGE, content: { type: 'doc', content: [] } },
    });
    await expect(svc.indexPage(PAGE_ID, WS)).rejects.toBeInstanceOf(
      StaleIndexInputError,
    );
    expect(repo.upsertChunks).not.toHaveBeenCalled();
  });

  it('labels a partially read document in its chunk header and hash', async () => {
    const partial = { ...PART, coverage: 'ocr_page_limit:30/45' };
    const { svc, repo } = makeSvc({
      attachmentContent: makeAttachmentContent({
        parts: [partial],
        pending: false,
      }),
    });
    await svc.indexPage(PAGE_ID, WS);
    const chunk = repo.upsertChunks.mock.calls[0][0].chunks[1];
    expect(chunk.chunkText.split('\n')[0]).toBe(
      '[Attachment: Contrat cadre 2026.pdf (partial text: ocr_page_limit:30/45)]',
    );
    expect(pageContentHashInput('T', 'b', [partial])).not.toBe(
      pageContentHashInput('T', 'b', [PART]),
    );
  });

  it('writes inside the re-check transaction', async () => {
    const { svc, repo, trx } = makeSvc({});
    await svc.indexPage(PAGE_ID, WS);
    expect(repo.upsertChunks.mock.calls[0][1]).toBe(trx);
  });

  it('embeds only new chunks: vectors of unchanged chunks are reused', async () => {
    const { svc, repo, ai } = makeSvc({});
    repo.findReusableVectors.mockResolvedValue(
      new Map([[PAGE.textContent, [9, 9, 9]]]),
    );

    const res = await svc.indexPage(PAGE_ID, WS);

    expect(repo.findReusableVectors).toHaveBeenCalledWith(
      'page',
      PAGE_ID,
      'mistral-embed',
      'Achats',
    );
    expect(ai.embedMany).toHaveBeenCalledTimes(1);
    expect(ai.embedMany.mock.calls[0][0]).toEqual([
      embeddingInput(
        'Achats',
        `${attachmentChunkHeader(PART.fileName)}\n${PART.text}`,
      ),
    ]);
    const chunks = repo.upsertChunks.mock.calls[0][0].chunks;
    expect(chunks[0].embedding).toEqual([9, 9, 9]);
    expect(res).toMatchObject({ chunksIndexed: 2, chunksReused: 1 });
  });

  it('skips re-embedding when neither the page nor its documents changed', async () => {
    const { svc, repo, ai } = makeSvc({});
    repo.isContentUnchanged.mockResolvedValue(true);
    expect((await svc.indexPage(PAGE_ID, WS)).status).toBe('skipped');
    expect(ai.embedMany).not.toHaveBeenCalled();
  });

  it('keeps the historical hash for pages without documents (no mass re-embedding)', () => {
    expect(pageContentHashInput('T', 'body', [])).toBe(
      embeddingInput('T', 'body'),
    );
  });

  it('changes the hash when a document is removed, replaced or renamed', () => {
    const withDoc = pageContentHashInput('T', 'body', [PART]);
    expect(withDoc).not.toBe(pageContentHashInput('T', 'body', []));
    expect(withDoc).not.toBe(
      pageContentHashInput('T', 'body', [{ ...PART, textSha256: 'other' }]),
    );
    expect(withDoc).not.toBe(
      pageContentHashInput('T', 'body', [{ ...PART, fileName: 'v2.pdf' }]),
    );
  });

  it('removing the last document re-indexes the page without it', async () => {
    const { svc, repo, chunking } = makeSvc({
      attachmentContent: makeAttachmentContent({ parts: [], pending: false }),
    });
    await svc.indexPage(PAGE_ID, WS);
    const call = repo.upsertChunks.mock.calls[0][0];
    expect(call.chunks).toHaveLength(1);
    expect(call.chunks[0].metadata.attachmentId).toBeUndefined();
    expect(call.contentHash).toBe(
      chunking.contentHash(embeddingInput('Achats', PAGE.textContent)),
    );
  });

  it('schedules a bounded follow-up when extraction is still pending', async () => {
    const pending = makeAttachmentContent({ parts: [], pending: true });
    const { svc } = makeSvc({ attachmentContent: pending });
    await svc.indexPage(PAGE_ID, WS, { attachmentFollowUp: 2 });
    expect(pending.scheduleFollowUp).toHaveBeenCalledWith(PAGE_ID, WS, 3);
  });

  it('still works without the attachment module (page text only)', async () => {
    const { svc, repo } = makeSvc({ attachmentContent: null });
    const res = await svc.indexPage(PAGE_ID, WS);
    expect(res).toMatchObject({ status: 'indexed', attachmentsIndexed: 0 });
    expect(repo.upsertChunks.mock.calls[0][0].chunks).toHaveLength(1);
  });
});

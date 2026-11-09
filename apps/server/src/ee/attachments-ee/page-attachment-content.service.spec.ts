import {
  MAX_ATTACHMENT_INDEX_CHARS,
  MAX_ATTACHMENT_FOLLOW_UPS,
  MAX_OCR_PER_PASS,
  PageAttachmentContentService,
  referencedAttachmentIds,
} from './page-attachment-content.service';
import { QueueJob } from '../../integrations/queue/constants';

const A1 = '0199d0a0-0000-7000-8000-000000000001';
const A2 = '0199d0a0-0000-7000-8000-000000000002';
const A3 = '0199d0a0-0000-7000-8000-000000000003';
const VERIFIED_AT = new Date('2026-10-01T12:00:00Z');

const doc = (...nodes: any[]) => ({ type: 'doc', content: nodes });
const p = (...content: any[]) => ({ type: 'paragraph', content });

describe('referencedAttachmentIds', () => {
  it('collects attachment ids of file/image/pdf/drawing nodes at any depth, once each', () => {
    const content = doc(
      { type: 'attachment', attrs: { attachmentId: A1, name: 'contrat.pdf' } },
      p({ type: 'text', text: 'voir pièce jointe' }),
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'image', attrs: { attachmentId: A2 } }],
              },
            ],
          },
        ],
      },
      { type: 'pdf', attrs: { attachmentId: A1 } },
      { type: 'drawio', attrs: { attachmentId: A3 } },
    );
    expect(referencedAttachmentIds(content)).toEqual([A1, A2, A3]);
  });

  it('ignores invalid ids, non-attachment nodes and malformed content', () => {
    expect(
      referencedAttachmentIds(
        doc(
          { type: 'attachment', attrs: { attachmentId: '../../etc/passwd' } },
          { type: 'mention', attrs: { attachmentId: A1 } },
          { type: 'image', attrs: {} },
        ),
      ),
    ).toEqual([]);
    expect(referencedAttachmentIds(null)).toEqual([]);
    expect(referencedAttachmentIds('not json')).toEqual([]);
    expect(
      referencedAttachmentIds(
        JSON.stringify(
          doc({ type: 'attachment', attrs: { attachmentId: A1 } }),
        ),
      ),
    ).toEqual([A1]);
  });
});

function makeDb(rows: any[]) {
  const wheres: any[] = [];
  const chain: any = {
    select: () => chain,
    where: (...args: any[]) => {
      wheres.push(args);
      return chain;
    },
    orderBy: () => chain,
    limit: () => chain,
    forShare: () => chain,
    execute: async () => rows,
  };
  return { db: { selectFrom: () => chain } as any, wheres };
}

function row(id: string, overrides: Record<string, any> = {}) {
  return {
    id,
    workspaceId: 'ws',
    pageId: 'page',
    spaceId: 'space',
    type: 'file',
    fileName: `${id.slice(-1)}.pdf`,
    fileExt: '.pdf',
    mimeType: 'application/pdf',
    fileSize: 100,
    filePath: `ws/files/${id}/x.pdf`,
    updatedAt: new Date('2026-09-30T00:00:00Z'),
    deletedAt: null,
    aiChatId: null,
    insightId: null,
    textContent: null,
    ...overrides,
  };
}

const PAGE = {
  id: 'page',
  workspaceId: 'ws',
  spaceId: 'space',
  content: doc(
    { type: 'attachment', attrs: { attachmentId: A1 } },
    { type: 'attachment', attrs: { attachmentId: A2 } },
    { type: 'attachment', attrs: { attachmentId: A3 } },
  ),
};

describe('PageAttachmentContentService.collectForPage', () => {
  const outcome = (text: string) => ({
    status: 'extracted',
    text,
    textSha256: `sha-${text}`,
  });

  it('only uses documents that existed before the verification', async () => {
    const { db } = makeDb([
      row(A1),
      row(A2, { updatedAt: new Date('2026-10-02T00:00:00Z') }), // replaced after verification
    ]);
    const extraction = {
      ensureExtracted: jest.fn(async (a: any, _opts: any) => outcome(a.id)),
    };
    const svc = new PageAttachmentContentService(
      db,
      extraction as any,
      {} as any,
    );

    const res = await svc.collectForPage(PAGE, VERIFIED_AT);

    expect(res.parts.map((x) => x.attachmentId)).toEqual([A1]);
    expect(extraction.ensureExtracted).toHaveBeenCalledTimes(1);
    expect(extraction.ensureExtracted.mock.calls[0][1]).toMatchObject({
      allowOcr: true,
      ocrBudget: { remaining: MAX_OCR_PER_PASS },
    });
  });

  it('indexes no document when the verification has no timestamp', async () => {
    const extraction = { ensureExtracted: jest.fn() };
    const svc = new PageAttachmentContentService(
      makeDb([row(A1)]).db,
      extraction as any,
      {} as any,
    );
    expect(await svc.collectForPage(PAGE, null)).toEqual({
      parts: [],
      pending: false,
    });
    expect(extraction.ensureExtracted).not.toHaveBeenCalled();
  });

  it('does not query attachments for a page that references none', async () => {
    const extraction = { ensureExtracted: jest.fn() };
    const svc = new PageAttachmentContentService(
      { selectFrom: jest.fn() } as any,
      extraction as any,
      {} as any,
    );
    expect(
      await svc.collectForPage({ ...PAGE, content: doc(p()) }, VERIFIED_AT),
    ).toEqual({ parts: [], pending: false });
  });

  it('scopes the query to the page, its workspace and space, and live page files only', async () => {
    const { db, wheres } = makeDb([]);
    const svc = new PageAttachmentContentService(
      db,
      { ensureExtracted: jest.fn() } as any,
      {} as any,
    );
    await svc.collectForPage(PAGE, VERIFIED_AT);
    const flat = wheres
      .filter((w) => typeof w[0] === 'string')
      .map((w) => w.join(' '));
    expect(flat).toEqual(
      expect.arrayContaining([
        `id in ${[A1, A2, A3].join(',')}`,
        'pageId = page',
        'workspaceId = ws',
        'deletedAt is ',
        'type = file',
        'aiChatId is ',
        'insightId is ',
      ]),
    );
  });

  it('flags pending work (busy / deferred / outage) and keeps what is ready', async () => {
    const { db } = makeDb([row(A1), row(A2), row(A3)]);
    const extraction = {
      ensureExtracted: jest
        .fn()
        .mockResolvedValueOnce(outcome('ready'))
        .mockResolvedValueOnce({ status: 'deferred' })
        .mockRejectedValueOnce(new Error('S3 503')),
    };
    const svc = new PageAttachmentContentService(
      db,
      extraction as any,
      {} as any,
    );

    const res = await svc.collectForPage(PAGE, VERIFIED_AT);

    expect(res.pending).toBe(true);
    expect(res.parts.map((x) => x.text)).toEqual(['ready']);
  });

  it('skips failed/unsupported/empty documents and caps text per document', async () => {
    const { db } = makeDb([row(A1), row(A2), row(A3)]);
    const extraction = {
      ensureExtracted: jest
        .fn()
        .mockResolvedValueOnce({ status: 'failed', text: null })
        .mockResolvedValueOnce({ status: 'unsupported', text: null })
        .mockResolvedValueOnce(
          outcome('x'.repeat(MAX_ATTACHMENT_INDEX_CHARS + 50)),
        ),
    };
    const svc = new PageAttachmentContentService(
      db,
      extraction as any,
      {} as any,
    );

    const res = await svc.collectForPage(PAGE, VERIFIED_AT);

    expect(res.pending).toBe(false);
    expect(res.parts).toHaveLength(1);
    expect(res.parts[0].text).toHaveLength(MAX_ATTACHMENT_INDEX_CHARS);
  });
});

describe('PageAttachmentContentService.stillCurrent / scheduleFollowUp', () => {
  it('is false when a document disappeared or its bytes changed', async () => {
    const part = {
      attachmentId: A1,
      fileName: 'a',
      text: 't',
      textSha256: 's',
      updatedAt: new Date('2026-09-30T00:00:00Z'),
    };
    const same = makeDb([
      { id: A1, updatedAt: new Date('2026-09-30T00:00:00Z') },
    ]);
    const changed = makeDb([
      { id: A1, updatedAt: new Date('2026-10-03T00:00:00Z') },
    ]);
    const gone = makeDb([]);
    const svc = new PageAttachmentContentService(
      {} as any,
      {} as any,
      {} as any,
    );
    expect(await svc.stillCurrent(same.db, 'page', [part])).toBe(true);
    expect(await svc.stillCurrent(changed.db, 'page', [part])).toBe(false);
    expect(await svc.stillCurrent(gone.db, 'page', [part])).toBe(false);
  });

  it('queues a delayed page re-index and stops after the follow-up cap', async () => {
    const queue = { add: jest.fn() };
    const svc = new PageAttachmentContentService(
      {} as any,
      {} as any,
      queue as any,
    );
    await svc.scheduleFollowUp('page', 'ws', 1);
    expect(queue.add).toHaveBeenCalledWith(
      QueueJob.GENERATE_PAGE_EMBEDDINGS,
      { pageIds: ['page'], workspaceId: 'ws', attachmentFollowUp: 1 },
      expect.objectContaining({
        delay: expect.any(Number),
        jobId: expect.stringContaining('page-attachments-page-1-'),
      }),
    );
    await svc.scheduleFollowUp('page', 'ws', MAX_ATTACHMENT_FOLLOW_UPS + 1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});

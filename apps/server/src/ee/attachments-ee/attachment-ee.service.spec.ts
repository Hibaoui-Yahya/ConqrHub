import { AttachmentEeService } from './attachment-ee.service';
import { AttachmentProcessor } from '../../core/attachment/processors/attachment.processor';
import { QueueJob } from '../../integrations/queue/constants';

const WS = 'ws-1';
const ATT = '0199d0a0-0000-7000-8000-000000000001';

function attachment(overrides: Record<string, any> = {}) {
  return {
    id: ATT,
    workspaceId: WS,
    pageId: 'page-1',
    spaceId: 'space-1',
    type: 'file',
    fileName: 'devis.pdf',
    fileExt: '.pdf',
    mimeType: 'application/pdf',
    fileSize: 10,
    filePath: `${WS}/files/${ATT}/devis.pdf`,
    updatedAt: new Date(),
    deletedAt: null,
    aiChatId: null,
    insightId: null,
    textContent: null,
    ...overrides,
  };
}

function makeDb(rows: Record<string, any>) {
  return {
    selectFrom: (table: string) => {
      const c: any = {
        select: () => c,
        where: () => c,
        executeTakeFirst: async () => rows[table],
      };
      return c;
    },
  } as any;
}

const referencingPage = {
  id: 'page-1',
  workspaceId: WS,
  deletedAt: null,
  content: {
    type: 'doc',
    content: [{ type: 'attachment', attrs: { attachmentId: ATT } }],
  },
};

function setup(rows: Record<string, any>) {
  const extraction = {
    ensureExtracted: jest
      .fn()
      .mockResolvedValue({ status: 'extracted', reused: null }),
  };
  const queue = { add: jest.fn() };
  const svc = new AttachmentEeService(
    makeDb(rows),
    extraction as any,
    queue as any,
  );
  return { svc, extraction, queue };
}

describe('AttachmentEeService.indexAttachment (upload-time, native only)', () => {
  it('prepares draft text without OCR and queues nothing for an unverified page', async () => {
    const { svc, extraction, queue } = setup({
      attachments: attachment(),
      pages: referencingPage,
      pageVerifications: { status: 'draft' },
    });
    await svc.indexAttachment(ATT);
    expect(extraction.ensureExtracted).toHaveBeenCalledWith(
      expect.objectContaining({ id: ATT }),
      { allowOcr: false },
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('asks the indexer to re-check a verified page that references the file', async () => {
    const { svc, queue } = setup({
      attachments: attachment(),
      pages: referencingPage,
      pageVerifications: { status: 'verified' },
    });
    await svc.indexAttachment(ATT);
    expect(queue.add).toHaveBeenCalledWith(QueueJob.GENERATE_PAGE_EMBEDDINGS, {
      pageIds: ['page-1'],
      workspaceId: WS,
    });
  });

  it('does not queue a re-index for a file the page no longer references', async () => {
    const { svc, queue } = setup({
      attachments: attachment(),
      pages: { ...referencingPage, content: { type: 'doc', content: [] } },
      pageVerifications: { status: 'verified' },
    });
    await svc.indexAttachment(ATT);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each([
    [
      'avatar',
      attachment({
        type: 'avatar',
        pageId: null,
        filePath: `${WS}/avatars/a.png`,
      }),
    ],
    [
      'chat file',
      attachment({
        type: 'chat',
        aiChatId: 'c1',
        filePath: `${WS}/chat-files/a.pdf`,
      }),
    ],
    ['deleted file', attachment({ deletedAt: new Date() })],
  ])('ignores a %s entirely', async (_l, att) => {
    const { svc, extraction } = setup({
      attachments: att,
      pages: referencingPage,
    });
    await svc.indexAttachment(ATT);
    expect(extraction.ensureExtracted).not.toHaveBeenCalled();
  });

  it('ignores files of a deleted or foreign page', async () => {
    for (const pages of [
      { ...referencingPage, deletedAt: new Date() },
      undefined,
    ]) {
      const { svc, extraction } = setup({ attachments: attachment(), pages });
      await svc.indexAttachment(ATT);
      expect(extraction.ensureExtracted).not.toHaveBeenCalled();
    }
  });
});

describe('AttachmentProcessor → AttachmentEeService wiring', () => {
  it('resolves the (previously missing) EE module and runs the index job', async () => {
    const ee = { indexAttachment: jest.fn(), indexAttachments: jest.fn() };
    const moduleRef = { get: jest.fn().mockReturnValue(ee) };
    const processor = new AttachmentProcessor({} as any, moduleRef as any);

    await processor.process({
      name: QueueJob.ATTACHMENT_INDEX_CONTENT,
      data: { attachmentId: ATT },
    } as any);
    await processor.process({
      name: QueueJob.ATTACHMENT_INDEXING,
      data: { workspaceId: WS },
    } as any);

    expect(moduleRef.get).toHaveBeenCalledWith(AttachmentEeService, {
      strict: false,
    });
    expect(ee.indexAttachment).toHaveBeenCalledWith(ATT);
    expect(ee.indexAttachments).toHaveBeenCalledWith(WS);
  });
});

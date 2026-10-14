import {
  AttachmentExtractionService,
  ExtractableAttachment,
  EXTRACTOR_VERSION,
  MAX_FAILED_RUNS,
  MAX_OCR_PAGES,
  MAX_SOURCE_BYTES,
  MIN_OCR_IMAGE_BYTES,
  isIngestibleAttachment,
  sha256,
} from './attachment-extraction.service';
import {
  ExtractionRow,
  ExtractionValues,
  SaveResult,
  StoreAttachmentRef,
} from './attachment-extraction.store';
import { OcrProviderError } from '../ai/providers/ai-provider.service';
import { StorageObjectNotFoundError } from '../../integrations/storage/storage.errors';
import {
  AttachmentKind,
  NativeExtractionResult,
} from './attachment-text-extractor';
import { buildDocx } from './__fixtures__/document-fixtures';

jest.setTimeout(30_000);

const WS = '0199d0a0-0000-7000-8000-00000000aaaa';
const OTHER_WS = '0199d0a0-0000-7000-8000-00000000bbbb';
const PAGE = '0199d0a0-0000-7000-8000-000000000101';

/** In-memory stand-in for AttachmentExtractionStore with the same guards. */
type FakeRow = ExtractionRow & {
  workspaceId: string;
  claimToken: string | null;
};
class FakeStore {
  rows = new Map<string, FakeRow>();
  texts = new Map<string, string | null>();
  attachments = new Map<
    string,
    { workspaceId: string; updatedAt: Date; deletedAt: Date | null }
  >();
  saves = 0;
  claims = 0;

  register(att: ExtractableAttachment) {
    this.attachments.set(att.id, {
      workspaceId: att.workspaceId,
      updatedAt: att.updatedAt,
      deletedAt: att.deletedAt ?? null,
    });
  }

  async findRow(id: string) {
    const r = this.rows.get(id);
    return r ? { ...r } : undefined;
  }

  async loadText(id: string) {
    return this.texts.get(id) ?? null;
  }

  async findDuplicate(
    workspaceId: string,
    sha: string,
    excludeId: string,
    version: number,
  ) {
    for (const r of this.rows.values()) {
      if (
        r.workspaceId === workspaceId &&
        r.sourceSha256 === sha &&
        r.extractorVersion === version &&
        ['extracted', 'empty'].includes(r.status) &&
        r.attachmentId !== excludeId
      ) {
        return {
          status: r.status,
          method: r.method,
          pageCount: r.pageCount,
          detail: r.detail,
          textContent: this.texts.get(r.attachmentId) ?? null,
        };
      }
    }
    return undefined;
  }

  async claimOcr(
    att: StoreAttachmentRef,
    claim: {
      sourceSha256: string;
      pageCount: number | null;
      extractorVersion: number;
    },
    leaseMs: number,
  ) {
    const r = this.rows.get(att.id);
    if (
      r &&
      r.status === 'ocr_running' &&
      r.updatedAt.getTime() >= Date.now() - leaseMs &&
      r.sourceSha256 === claim.sourceSha256
    ) {
      return null;
    }
    const token = `claim-${++this.claims}`;
    this.rows.set(att.id, {
      attachmentId: att.id,
      workspaceId: att.workspaceId,
      status: 'ocr_running',
      method: null,
      sourceSha256: claim.sourceSha256,
      sourceSize: Number(att.fileSize ?? 0),
      sourceUpdatedAt: att.updatedAt,
      textSha256: r?.textSha256 ?? null,
      pageCount: claim.pageCount,
      attempts: r?.attempts ?? 0,
      detail: r?.detail ?? null,
      extractorVersion: claim.extractorVersion,
      updatedAt: new Date(),
      claimToken: token,
    });
    return token;
  }

  async save(
    att: StoreAttachmentRef,
    values: ExtractionValues,
    text: string | null,
    opts: { claimToken?: string; leaseMs: number },
  ): Promise<SaveResult> {
    const current = this.rows.get(att.id);
    if (opts.claimToken) {
      if (!current || current.claimToken !== opts.claimToken) return 'late';
    } else if (
      current?.status === 'ocr_running' &&
      Date.now() - current.updatedAt.getTime() < opts.leaseMs &&
      (!values.sourceSha256 || current.sourceSha256 === values.sourceSha256)
    ) {
      return 'busy';
    }
    const a = this.attachments.get(att.id);
    if (
      !a ||
      a.deletedAt ||
      a.updatedAt.getTime() !== att.updatedAt.getTime()
    ) {
      return 'changed';
    }
    this.saves++;
    this.texts.set(att.id, text);
    this.rows.set(att.id, {
      attachmentId: att.id,
      workspaceId: att.workspaceId,
      status: values.status,
      method: values.method,
      sourceSha256: values.sourceSha256,
      sourceSize: values.sourceSize,
      sourceUpdatedAt: values.sourceUpdatedAt,
      textSha256: values.textSha256,
      pageCount: values.pageCount,
      attempts: values.attempts,
      detail: values.detail,
      extractorVersion: values.extractorVersion,
      updatedAt: new Date(),
      claimToken: null,
    });
    return 'written';
  }
}

class TestExtractionService extends AttachmentExtractionService {
  nativeOverride?: (
    bytes: Buffer,
    kind: AttachmentKind,
  ) => Promise<NativeExtractionResult>;
  delays: number[] = [];

  protected nativeExtract(bytes: Buffer, kind: AttachmentKind) {
    return this.nativeOverride
      ? this.nativeOverride(bytes, kind)
      : super.nativeExtract(bytes, kind);
  }

  protected async delay(ms: number) {
    this.delays.push(ms);
  }
}

let seq = 0;
function makeAttachment(
  overrides: Partial<ExtractableAttachment> & { bytes?: Buffer } = {},
): ExtractableAttachment {
  seq++;
  const id = `0199d0a0-0000-7000-8000-${String(seq).padStart(12, '0')}`;
  const workspaceId = overrides.workspaceId ?? WS;
  const fileName = overrides.fileName ?? 'rapport.docx';
  const { bytes: _b, ...rest } = overrides;
  return {
    id,
    workspaceId,
    pageId: PAGE,
    spaceId: 'space-1',
    type: 'file',
    fileName,
    fileExt: '.' + fileName.split('.').pop(),
    mimeType: null,
    fileSize: overrides.bytes?.length ?? 1000,
    filePath: `${workspaceId}/files/${id}/${fileName}`,
    updatedAt: new Date('2026-10-01T10:00:00.123Z'),
    deletedAt: null,
    aiChatId: null,
    insightId: null,
    ...rest,
  };
}

function setup(opts: { ocrAvailable?: boolean; ocr?: jest.Mock } = {}) {
  const store = new FakeStore();
  const files = new Map<string, Buffer>();
  const storage = {
    read: jest.fn(async (path: string) => {
      const b = files.get(path);
      if (!b) throw new StorageObjectNotFoundError(`missing ${path}`);
      return b;
    }),
  };
  const ocr =
    opts.ocr ??
    jest.fn(async () => ({
      model: 'mistral-ocr-latest',
      pages: [
        {
          index: 0,
          markdown:
            'FACTURE 2026-117\n![img-0.jpeg](img-0.jpeg)\nTotal : 4 500 $',
        },
      ],
      pagesProcessed: 1,
    }));
  const ai = {
    isOcrAvailable: jest.fn(() => opts.ocrAvailable ?? true),
    ocrDocument: ocr,
  };
  const svc = new TestExtractionService(
    store as any,
    storage as any,
    ai as any,
  );
  const add = (att: ExtractableAttachment, bytes: Buffer) => {
    files.set(att.filePath, bytes);
    store.register(att);
    return att;
  };
  return { svc, store, storage, ai, ocr, files, add };
}

const IMAGE = Buffer.alloc(MIN_OCR_IMAGE_BYTES + 10, 7);

describe('isIngestibleAttachment — only real page documents', () => {
  it.each([
    ['avatar', { type: 'avatar' }],
    ['workspace logo', { type: 'workspace-icon' }],
    ['space cover', { type: 'space-cover' }],
    ['AI chat file', { type: 'chat', aiChatId: 'chat-1' }],
    ['file claimed by a chat', { aiChatId: 'chat-1' }],
    ['expert-insight upload', { insightId: 'ins-1' }],
    ['file without a page', { pageId: null }],
    ['deleted file', { deletedAt: new Date() }],
    ['avatar path mislabelled as file', { filePath: `${WS}/avatars/x.png` }],
    ['another workspace path', { filePath: `${OTHER_WS}/files/x/y.pdf` }],
  ])('rejects %s', (_label, overrides) => {
    expect(isIngestibleAttachment(makeAttachment(overrides as any))).toBe(
      false,
    );
  });

  it('accepts a page file stored under the workspace files folder', () => {
    expect(isIngestibleAttachment(makeAttachment())).toBe(true);
  });
});

describe('AttachmentExtractionService.ensureExtracted', () => {
  it('never reads or OCRs avatars, logos or chat files', async () => {
    const { svc, storage, ocr } = setup();
    for (const type of ['avatar', 'workspace-icon', 'chat']) {
      const res = await svc.ensureExtracted(
        makeAttachment({ type, fileName: 'photo.png' }),
        { allowOcr: true },
      );
      expect(res.status).toBe('skipped');
    }
    expect(storage.read).not.toHaveBeenCalled();
    expect(ocr).not.toHaveBeenCalled();
  });

  it('extracts a DOCX natively through StorageService, without any OCR charge', async () => {
    const { svc, storage, ocr, add } = setup();
    const docx = buildDocx([
      'Politique de télétravail',
      'Deux jours par semaine.',
    ]);
    const att = add(makeAttachment({ bytes: docx }), docx);

    const res = await svc.ensureExtracted(att, { allowOcr: true });

    expect(res).toMatchObject({
      status: 'extracted',
      method: 'native',
      reused: null,
    });
    expect(res.text).toContain('Deux jours par semaine.');
    expect(res.textSha256).toBe(sha256(res.text!));
    expect(storage.read).toHaveBeenCalledWith(att.filePath);
    expect(ocr).not.toHaveBeenCalled();
  });

  it('serves a repeat from the cache without reading the file again', async () => {
    const { svc, storage, add } = setup();
    const md = Buffer.from('# Onboarding\n\nÉtape 1 : badge');
    const att = add(makeAttachment({ fileName: 'guide.md', bytes: md }), md);

    await svc.ensureExtracted(att, { allowOcr: false });
    const again = await svc.ensureExtracted(att, { allowOcr: true });

    expect(again).toMatchObject({ status: 'extracted', reused: 'cache' });
    expect(again.text).toBe('# Onboarding\n\nÉtape 1 : badge');
    expect(storage.read).toHaveBeenCalledTimes(1);
  });

  it('records an image at upload as needing OCR without downloading it', async () => {
    const { svc, storage, ocr, add } = setup();
    const att = add(
      makeAttachment({ fileName: 'scan.png', bytes: IMAGE }),
      IMAGE,
    );

    const res = await svc.ensureExtracted(att, { allowOcr: false });

    expect(res.status).toBe('needs_ocr');
    expect(storage.read).not.toHaveBeenCalled();
    expect(ocr).not.toHaveBeenCalled();
  });

  it('OCRs an image once (inline data, canonical MIME) and caches the text', async () => {
    const { svc, ocr, add } = setup();
    const att = add(
      makeAttachment({
        fileName: 'facture.JPG',
        mimeType: 'image/jpg',
        bytes: IMAGE,
      }),
      IMAGE,
    );

    await svc.ensureExtracted(att, { allowOcr: false });
    const first = await svc.ensureExtracted(att, { allowOcr: true });
    const second = await svc.ensureExtracted(att, { allowOcr: true });

    expect(first).toMatchObject({
      status: 'extracted',
      method: 'ocr',
      ocrPagesBilled: 1,
    });
    // Image placeholders from the OCR markdown are dropped.
    expect(first.text).toBe('FACTURE 2026-117\n\nTotal : 4 500 $');
    expect(second).toMatchObject({
      status: 'extracted',
      reused: 'cache',
      ocrPagesBilled: 0,
    });
    expect(ocr).toHaveBeenCalledTimes(1);
    expect(ocr.mock.calls[0][0]).toMatchObject({
      mimeType: 'image/jpeg',
      pages: undefined,
    });
    expect(Buffer.isBuffer(ocr.mock.calls[0][0].data)).toBe(true);
  });

  it('OCRs a scanned PDF only up to the page limit and says so', async () => {
    const ocr = jest.fn(async (args: any) => ({
      model: 'mistral-ocr-latest',
      pages: args.pages.map((i: number) => ({
        index: i,
        markdown: `Page ${i + 1}`,
      })),
      pagesProcessed: args.pages.length,
    }));
    const { svc, add } = setup({ ocr });
    svc.nativeOverride = async () => ({
      status: 'needs_ocr',
      text: null,
      pageCount: 45,
    });
    const pdf = Buffer.from('%PDF-scan');
    const att = add(
      makeAttachment({ fileName: 'contrat-signe.pdf', bytes: pdf }),
      pdf,
    );

    const res = await svc.ensureExtracted(att, { allowOcr: true });

    expect(ocr).toHaveBeenCalledTimes(1);
    expect(ocr.mock.calls[0][0].pages).toEqual(
      Array.from({ length: MAX_OCR_PAGES }, (_, i) => i),
    );
    expect(ocr.mock.calls[0][0].mimeType).toBe('application/pdf');
    // 30 of 45 pages read: partial, never presented as complete.
    expect(res).toMatchObject({
      status: 'partial',
      method: 'ocr',
      ocrPagesBilled: MAX_OCR_PAGES,
      reason: `ocr_page_limit:${MAX_OCR_PAGES}/45`,
    });
    // And it stays partial (not retried, not upgraded) from the cache.
    const again = await svc.ensureExtracted(att, { allowOcr: true });
    expect(again).toMatchObject({
      status: 'partial',
      reused: 'cache',
      reason: `ocr_page_limit:${MAX_OCR_PAGES}/45`,
    });
    expect(ocr).toHaveBeenCalledTimes(1);
  });

  it('reuses the text of identical bytes in the same workspace, never across workspaces', async () => {
    const { svc, ocr, add } = setup();
    const a = add(
      makeAttachment({ fileName: 'scan.png', bytes: IMAGE }),
      IMAGE,
    );
    const copy = add(
      makeAttachment({ fileName: 'scan-copie.png', bytes: IMAGE }),
      IMAGE,
    );
    const foreign = add(
      makeAttachment({
        fileName: 'scan.png',
        workspaceId: OTHER_WS,
        bytes: IMAGE,
      }),
      IMAGE,
    );

    await svc.ensureExtracted(a, { allowOcr: true });
    const dup = await svc.ensureExtracted(copy, { allowOcr: true });
    expect(dup).toMatchObject({ status: 'extracted', reused: 'dedup' });
    expect(ocr).toHaveBeenCalledTimes(1);

    const other = await svc.ensureExtracted(foreign, { allowOcr: true });
    expect(other.reused).toBeNull();
    expect(ocr).toHaveBeenCalledTimes(2);
  });

  it('re-extracts a replaced file and the text hash changes', async () => {
    const { svc, store, files, add } = setup();
    const v1 = Buffer.from('Tarif : 100 $');
    const att = add(makeAttachment({ fileName: 'tarifs.txt', bytes: v1 }), v1);
    const first = await svc.ensureExtracted(att, { allowOcr: false });

    const v2 = Buffer.from('Tarif : 140 $ (révisé)');
    const replaced = {
      ...att,
      fileSize: v2.length,
      updatedAt: new Date('2026-10-02T09:00:00Z'),
    };
    files.set(att.filePath, v2);
    store.register(replaced);
    const second = await svc.ensureExtracted(replaced, { allowOcr: false });

    expect(second.text).toBe('Tarif : 140 $ (révisé)');
    expect(second.textSha256).not.toBe(first.textSha256);
  });

  it('writes nothing when the file is replaced or deleted during extraction', async () => {
    const { svc, store, add } = setup();
    const txt = Buffer.from('Ancien contenu');
    const att = add(makeAttachment({ fileName: 'note.txt', bytes: txt }), txt);
    store.attachments.get(att.id)!.updatedAt = new Date('2026-10-05T00:00:00Z');

    const res = await svc.ensureExtracted(att, { allowOcr: false });

    expect(res).toMatchObject({
      status: 'skipped',
      reason: 'attachment_changed',
      text: null,
    });
    expect(store.saves).toBe(0);
  });

  it('retries transient OCR errors with backoff inside one run', async () => {
    const ocr = jest
      .fn()
      .mockRejectedValueOnce(new OcrProviderError('HTTP 429', true, 429))
      .mockRejectedValueOnce(new OcrProviderError('timed out', true))
      .mockResolvedValue({
        model: 'm',
        pages: [{ index: 0, markdown: 'Reçu n° 42' }],
        pagesProcessed: 1,
      });
    const { svc, add } = setup({ ocr });
    const att = add(
      makeAttachment({ fileName: 'recu.png', bytes: IMAGE }),
      IMAGE,
    );

    const res = await svc.ensureExtracted(att, { allowOcr: true });

    expect(res).toMatchObject({ status: 'extracted', text: 'Reçu n° 42' });
    expect(ocr).toHaveBeenCalledTimes(3);
    expect(svc.delays).toEqual([2000, 8000]);
  });

  it('caps failed runs: after MAX_FAILED_RUNS the provider is not called again', async () => {
    const ocr = jest
      .fn()
      .mockRejectedValue(new OcrProviderError('HTTP 503', true, 503));
    const { svc, store, add } = setup({ ocr });
    const att = add(
      makeAttachment({ fileName: 'scan.png', bytes: IMAGE }),
      IMAGE,
    );

    for (let run = 1; run <= MAX_FAILED_RUNS; run++) {
      const res = await svc.ensureExtracted(att, { allowOcr: true });
      expect(res).toMatchObject({
        status: 'failed',
        reason: 'ocr_provider_error',
      });
      expect(store.rows.get(att.id)!.attempts).toBe(run);
    }
    const calls = ocr.mock.calls.length;
    expect(calls).toBe(MAX_FAILED_RUNS * 3);

    const after = await svc.ensureExtracted(att, { allowOcr: true });
    expect(after).toMatchObject({ status: 'failed', reason: 'retry_limit' });
    expect(ocr).toHaveBeenCalledTimes(calls);
  });

  it('does not retry a document the provider rejects (4xx)', async () => {
    const ocr = jest
      .fn()
      .mockRejectedValue(new OcrProviderError('HTTP 422', false, 422));
    const { svc, store, add } = setup({ ocr });
    const att = add(
      makeAttachment({ fileName: 'scan.png', bytes: IMAGE }),
      IMAGE,
    );

    const res = await svc.ensureExtracted(att, { allowOcr: true });
    await svc.ensureExtracted(att, { allowOcr: true });

    expect(res).toMatchObject({ status: 'failed', reason: 'ocr_rejected' });
    expect(store.rows.get(att.id)!.attempts).toBe(MAX_FAILED_RUNS);
    expect(ocr).toHaveBeenCalledTimes(1);
  });

  it('counts a credential error (401) as one failed run, retryable later', async () => {
    const ocr = jest
      .fn()
      .mockRejectedValue(new OcrProviderError('HTTP 401', false, 401));
    const { svc, store, add } = setup({ ocr });
    const att = add(
      makeAttachment({ fileName: 'scan.png', bytes: IMAGE }),
      IMAGE,
    );

    await svc.ensureExtracted(att, { allowOcr: true });

    expect(ocr).toHaveBeenCalledTimes(1);
    expect(store.rows.get(att.id)!.attempts).toBe(1);
  });

  it('does not OCR while another worker holds a fresh claim', async () => {
    const { svc, store, ocr, add } = setup();
    const att = add(
      makeAttachment({ fileName: 'scan.png', bytes: IMAGE }),
      IMAGE,
    );
    await svc.ensureExtracted(att, { allowOcr: false });
    store.rows.get(att.id)!.status = 'ocr_running';
    store.rows.get(att.id)!.updatedAt = new Date();

    const res = await svc.ensureExtracted(att, { allowOcr: true });

    expect(res.status).toBe('busy');
    expect(ocr).not.toHaveBeenCalled();
  });

  it('defers OCR once the pass budget is spent', async () => {
    const { svc, ocr, add } = setup();
    const budget = { remaining: 1 };
    const a = add(makeAttachment({ fileName: 'a.png', bytes: IMAGE }), IMAGE);
    const b = add(
      makeAttachment({
        fileName: 'b.png',
        bytes: Buffer.alloc(IMAGE.length, 9),
      }),
      Buffer.alloc(IMAGE.length, 9),
    );

    expect(
      (await svc.ensureExtracted(a, { allowOcr: true, ocrBudget: budget }))
        .status,
    ).toBe('extracted');
    expect(
      (await svc.ensureExtracted(b, { allowOcr: true, ocrBudget: budget }))
        .status,
    ).toBe('deferred');
    expect(ocr).toHaveBeenCalledTimes(1);
  });

  it('reports OCR as unavailable instead of failing when no provider is configured', async () => {
    const { svc, ocr, add } = setup({ ocrAvailable: false });
    const att = add(
      makeAttachment({ fileName: 'scan.png', bytes: IMAGE }),
      IMAGE,
    );

    const res = await svc.ensureExtracted(att, { allowOcr: true });

    expect(res).toMatchObject({
      status: 'needs_ocr',
      reason: 'ocr_unavailable',
    });
    expect(ocr).not.toHaveBeenCalled();
  });

  it('refuses oversized sources before reading them', async () => {
    const { svc, storage, add } = setup();
    const att = add(
      makeAttachment({ fileName: 'gros.pdf', fileSize: MAX_SOURCE_BYTES + 1 }),
      Buffer.from('x'),
    );

    const res = await svc.ensureExtracted(att, { allowOcr: true });

    expect(res).toMatchObject({
      status: 'too_large',
      reason: 'source_size_limit',
    });
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('refuses images too large for OCR, and ignores tiny decorative images', async () => {
    const { svc, ocr, add } = setup();
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    const tiny = Buffer.alloc(100, 1);
    const a = add(makeAttachment({ fileName: 'photo.png', bytes: big }), big);
    const b = add(makeAttachment({ fileName: 'icone.png', bytes: tiny }), tiny);

    expect(await svc.ensureExtracted(a, { allowOcr: true })).toMatchObject({
      status: 'too_large',
      reason: 'ocr_size_limit',
    });
    expect(await svc.ensureExtracted(b, { allowOcr: true })).toMatchObject({
      status: 'empty',
      reason: 'image_too_small',
    });
    expect(ocr).not.toHaveBeenCalled();
  });

  it('marks a file missing from storage as failed (terminal), but rethrows storage outages', async () => {
    const { svc, store, storage, add } = setup();
    const att = add(
      makeAttachment({ fileName: 'perdu.txt' }),
      Buffer.from('x'),
    );
    storage.read.mockRejectedValueOnce(new StorageObjectNotFoundError('404'));
    expect(await svc.ensureExtracted(att, { allowOcr: false })).toMatchObject({
      status: 'failed',
      reason: 'missing_source',
    });
    expect(store.rows.get(att.id)!.attempts).toBe(MAX_FAILED_RUNS);

    const other = add(
      makeAttachment({ fileName: 'note.txt' }),
      Buffer.from('x'),
    );
    storage.read.mockRejectedValueOnce(
      new Error('Failed to read file from S3: AccessDenied'),
    );
    await expect(
      svc.ensureExtracted(other, { allowOcr: false }),
    ).rejects.toThrow('AccessDenied');
    expect(store.rows.has(other.id)).toBe(false);
  });

  it('records corrupt, blank and unsupported files honestly', async () => {
    const { svc, storage, add } = setup();
    const corrupt = add(
      makeAttachment({ fileName: 'casse.docx' }),
      Buffer.from('PK\u0003\u0004garbage'),
    );
    const blank = add(
      makeAttachment({ fileName: 'vide.txt' }),
      Buffer.from('   \n\n'),
    );
    const legacy = add(
      makeAttachment({ fileName: 'ancien.doc' }),
      Buffer.from('x'),
    );

    const c = await svc.ensureExtracted(corrupt, { allowOcr: true });
    expect(c.status).toBe('failed');
    expect(
      (await svc.ensureExtracted(corrupt, { allowOcr: true })).reason,
    ).toBe('retry_limit');
    expect((await svc.ensureExtracted(blank, { allowOcr: true })).status).toBe(
      'empty',
    );

    storage.read.mockClear();
    expect((await svc.ensureExtracted(legacy, { allowOcr: true })).status).toBe(
      'unsupported',
    );
    expect(storage.read).not.toHaveBeenCalled();
  });

  describe('mixed PDFs (text layer + scanned pages)', () => {
    const mixed = (textless: number[], pageCount: number) => async () => ({
      status: 'extracted' as const,
      text: 'native text',
      pageCount,
      truncated: true,
      partial: `pages_without_text:${textless.length}/${pageCount}`,
      pageTexts: Array.from({ length: pageCount }, (_, i) =>
        textless.includes(i) ? '' : `Texte natif page ${i + 1}`,
      ),
      textlessPages: textless,
    });
    const ocrPages = () =>
      jest.fn(async (args: any) => ({
        model: 'm',
        pages: args.pages.map((i: number) => ({
          index: i,
          markdown: `Scan page ${i + 1}`,
        })),
        pagesProcessed: args.pages.length,
      }));

    it('is partial at upload, then OCRs only the scanned pages and merges them in order', async () => {
      const ocr = ocrPages();
      const { svc, add } = setup({ ocr });
      svc.nativeOverride = mixed([1, 3], 4);
      const pdf = Buffer.from('%PDF-mixed');
      const att = add(
        makeAttachment({ fileName: 'dossier.pdf', bytes: pdf }),
        pdf,
      );

      const upload = await svc.ensureExtracted(att, { allowOcr: false });
      expect(upload).toMatchObject({
        status: 'partial',
        method: 'native',
        reason: 'pages_without_text:2/4',
      });
      expect(ocr).not.toHaveBeenCalled();

      const verified = await svc.ensureExtracted(att, { allowOcr: true });
      expect(ocr).toHaveBeenCalledTimes(1);
      expect(ocr.mock.calls[0][0].pages).toEqual([1, 3]);
      expect(verified).toMatchObject({
        status: 'extracted',
        method: 'native+ocr',
        ocrPagesBilled: 2,
      });
      expect(verified.text).toBe(
        'Texte natif page 1\n\nScan page 2\n\nTexte natif page 3\n\nScan page 4',
      );

      const cached = await svc.ensureExtracted(att, { allowOcr: true });
      expect(cached).toMatchObject({ status: 'extracted', reused: 'cache' });
      expect(ocr).toHaveBeenCalledTimes(1);
    });

    it('caps OCR of scanned pages and reports the rest honestly, without retrying', async () => {
      const ocr = ocrPages();
      const { svc, add } = setup({ ocr });
      const textless = Array.from({ length: 35 }, (_, i) => i + 5);
      svc.nativeOverride = mixed(textless, 40);
      const pdf = Buffer.from('%PDF-big-mixed');
      const att = add(
        makeAttachment({ fileName: 'archive.pdf', bytes: pdf }),
        pdf,
      );

      const res = await svc.ensureExtracted(att, { allowOcr: true });
      expect(ocr.mock.calls[0][0].pages).toHaveLength(MAX_OCR_PAGES);
      expect(res.status).toBe('partial');
      expect(res.reason).toBe(
        `pages_without_text:5/40,ocr_page_limit:${MAX_OCR_PAGES}/35`,
      );
      await svc.ensureExtracted(att, { allowOcr: true });
      expect(ocr).toHaveBeenCalledTimes(1);
    });

    it('keeps the native text as partial when OCR of the scanned pages fails, and retries later', async () => {
      const ocr = jest
        .fn()
        .mockRejectedValue(new OcrProviderError('HTTP 503', true, 503));
      const { svc, store, add } = setup({ ocr });
      svc.nativeOverride = mixed([1], 2);
      const pdf = Buffer.from('%PDF-mixed-2');
      const att = add(makeAttachment({ fileName: 'x.pdf', bytes: pdf }), pdf);

      const res = await svc.ensureExtracted(att, { allowOcr: true });
      expect(res).toMatchObject({
        status: 'partial',
        method: 'native',
        text: 'native text',
      });
      expect(res.reason).toContain('pages_without_text:1/2');
      expect(store.rows.get(att.id)!.attempts).toBe(1);
      await svc.ensureExtracted(att, { allowOcr: true });
      expect(ocr).toHaveBeenCalledTimes(6); // 2 runs x 3 tries
    });
  });

  describe('late and concurrent OCR results', () => {
    it('drops an OCR result whose claim was taken over meanwhile (no overwrite)', async () => {
      const { svc, store, add } = setup();
      const att = add(
        makeAttachment({ fileName: 'scan.png', bytes: IMAGE }),
        IMAGE,
      );
      (svc as any).ai.ocrDocument = jest.fn(async () => {
        // Another worker takes over the claim while this call is in flight.
        const row = store.rows.get(att.id)!;
        row.claimToken = 'someone-else';
        store.texts.set(att.id, 'newer text');
        return {
          model: 'm',
          pages: [{ index: 0, markdown: 'late text' }],
          pagesProcessed: 1,
        };
      });

      const res = await svc.ensureExtracted(att, { allowOcr: true });

      expect(res).toMatchObject({
        status: 'skipped',
        reason: 'superseded_ocr_result',
      });
      expect(store.texts.get(att.id)).toBe('newer text');
    });

    it('a stale claim on the previous bytes does not block a replaced file', async () => {
      const { svc, store, files, ocr, add } = setup();
      const att = add(
        makeAttachment({ fileName: 'scan.png', bytes: IMAGE }),
        IMAGE,
      );
      await svc.ensureExtracted(att, { allowOcr: false });
      const row = store.rows.get(att.id)!;
      Object.assign(row, {
        status: 'ocr_running',
        sourceSha256: 'old-bytes',
        updatedAt: new Date(),
        claimToken: 'old',
      });

      const v2 = Buffer.alloc(IMAGE.length, 3);
      const replaced = { ...att, updatedAt: new Date('2026-10-03T00:00:00Z') };
      files.set(att.filePath, v2);
      store.register(replaced);
      const res = await svc.ensureExtracted(replaced, { allowOcr: true });

      expect(res.status).toBe('extracted');
      expect(ocr).toHaveBeenCalledTimes(1);
    });
  });

  it('re-extracts everything once the extractor version changes', async () => {
    const { svc, store, storage, add } = setup();
    const txt = Buffer.from('v1');
    const att = add(makeAttachment({ fileName: 'a.txt', bytes: txt }), txt);
    await svc.ensureExtracted(att, { allowOcr: false });
    store.rows.get(att.id)!.extractorVersion = EXTRACTOR_VERSION - 1;
    store.rows.get(att.id)!.sourceSha256 = 'old';

    await svc.ensureExtracted(att, { allowOcr: false });

    expect(storage.read).toHaveBeenCalledTimes(2);
  });
});

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { StorageService } from '../../integrations/storage/storage.service';
import { isStorageObjectNotFound } from '../../integrations/storage/storage.errors';
import {
  AiProviderService,
  OcrProviderError,
  OcrResult,
} from '../ai/providers/ai-provider.service';
import {
  AttachmentKind,
  extractNativeText,
  MAX_EXTRACTED_CHARS,
  NativeExtractionResult,
  normalizeAttachmentType,
  normalizeExtractedText,
} from './attachment-text-extractor';
import {
  AttachmentExtractionStore,
  ExtractionRow,
  SaveResult,
} from './attachment-extraction.store';

/** Bump to re-extract everything once the extraction logic changes. */
export const EXTRACTOR_VERSION = 2;
/** Largest attachment read at all (native parsing happens in memory). */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Largest PDF sent to OCR, and pages OCR'd (and billed) per document. */
export const MAX_OCR_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_OCR_PAGES = 30;
/** Image bounds for OCR: tiny images are icons/decoration, not documents. */
export const MAX_OCR_IMAGE_BYTES = 10 * 1024 * 1024;
export const MIN_OCR_IMAGE_BYTES = 2 * 1024;
export const OCR_TIMEOUT_MS = 120_000;
/** Tries per run for transient OCR errors (timeouts, 429, 5xx). */
export const OCR_TRIES_PER_RUN = 3;
/** Failed runs after which an attachment is left alone until its bytes change. */
export const MAX_FAILED_RUNS = 3;
/**
 * An `ocr_running` claim older than this is considered abandoned. It exceeds
 * the longest possible run (3 tries x 120 s + 10 s of backoff), so a live
 * worker never loses its claim; a result arriving after a takeover is
 * discarded (claim token mismatch) instead of overwriting newer state.
 */
export const OCR_LEASE_MS = 15 * 60 * 1000;

export type ExtractionStatus =
  | 'extracted' // the whole document is in the text
  | 'partial' // only part of it is (see `coverage`)
  | 'empty'
  | 'needs_ocr'
  | 'ocr_running'
  | 'unsupported'
  | 'too_large'
  | 'failed';

export type ExtractionMethod = 'native' | 'ocr' | 'native+ocr';

export interface ExtractableAttachment {
  id: string;
  workspaceId: string;
  pageId: string | null;
  spaceId?: string | null;
  type: string | null;
  fileName: string;
  fileExt: string | null;
  mimeType: string | null;
  fileSize: number | string | bigint | null;
  filePath: string;
  updatedAt: Date;
  deletedAt?: Date | null;
  aiChatId?: string | null;
  insightId?: string | null;
  /** Current attachments.text_content when the caller already loaded it. */
  textContent?: string | null;
}

export interface ExtractionOutcome {
  attachmentId: string;
  status:
    | ExtractionStatus
    | 'skipped' // not a page document, or changed / superseded meanwhile
    | 'busy' // another worker is running OCR for it right now
    | 'deferred'; // OCR needed but this pass's OCR budget is spent
  method: ExtractionMethod | null;
  text: string | null;
  textSha256: string | null;
  /** Where the text came from without new work. */
  reused: 'cache' | 'dedup' | null;
  /** Pages billed by the OCR call made in this run (0 when none was made). */
  ocrPagesBilled: number;
  /**
   * Machine-readable reason / coverage, e.g. `ocr_page_limit:30/45`,
   * `pages_without_text:2/12`, `native_page_limit:400/512`, `char_limit`.
   */
  reason?: string;
}

/**
 * Only real page documents are ever extracted: a `file` attachment that
 * belongs to a page, stored under the workspace's `files/` folder, not a chat
 * upload, not an expert-insight upload, not deleted. Avatars, workspace/space
 * logos and covers, and AI-chat files are excluded by type *and* by path.
 */
export function isIngestibleAttachment(a: ExtractableAttachment): boolean {
  return (
    a.type === 'file' &&
    !!a.pageId &&
    !a.deletedAt &&
    !a.aiChatId &&
    !a.insightId &&
    typeof a.filePath === 'string' &&
    a.filePath.startsWith(`${a.workspaceId}/files/`)
  );
}

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function sameInstant(
  a: Date | string | null,
  b: Date | string | null,
): boolean {
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

/** Mistral returns Markdown with `![img-0.jpeg](img-0.jpeg)` placeholders. */
function cleanOcrMarkdown(markdown: string): string {
  return markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
}

/** Whether a stored partial result still has scanned pages OCR could fill. */
function hasPagesAwaitingOcr(detail: string | null | undefined): boolean {
  return !!detail && detail.includes('pages_without_text');
}

function joinReasons(
  ...parts: Array<string | undefined | null>
): string | undefined {
  const r = parts.filter(Boolean).join(',');
  return r || undefined;
}

interface PersistFields {
  status: ExtractionStatus;
  method: ExtractionMethod | null;
  sourceSha256?: string | null;
  pageCount?: number | null;
  ocrPages?: number;
  attempts?: number;
  lastError?: string | null;
  /** Owner token of an OCR claim: the write is dropped if it was superseded. */
  claimToken?: string;
}

/**
 * Durable, bounded text extraction for page attachments.
 *
 * - Native extraction first (free, local). OCR only for images, scanned
 *   PDFs and the scanned pages of mixed PDFs, only when the caller allows it
 *   (the indexer does so for verified pages), within size/page limits and
 *   an OCR budget.
 * - Coverage is explicit: a document only partly read (OCR page limit,
 *   pages without text, native page or character limits) is `partial` with
 *   its reason, never `extracted`.
 * - Results are keyed by the attachment's bytes (`updated_at` + size, then
 *   SHA-256), so re-indexing never repays OCR for an unchanged file, and an
 *   identical file elsewhere in the workspace reuses the earlier text.
 * - Transient OCR errors are retried a few times per run and the number of
 *   failed runs is capped; deterministic failures (corrupt file, 4xx) are
 *   terminal until the file changes. Concurrent and late OCR results cannot
 *   overwrite each other (claim lease + token).
 */
@Injectable()
export class AttachmentExtractionService {
  private readonly logger = new Logger(AttachmentExtractionService.name);

  constructor(
    private readonly store: AttachmentExtractionStore,
    private readonly storage: StorageService,
    private readonly ai: AiProviderService,
  ) {}

  async ensureExtracted(
    att: ExtractableAttachment,
    opts: { allowOcr: boolean; ocrBudget?: { remaining: number } },
  ): Promise<ExtractionOutcome> {
    if (!isIngestibleAttachment(att)) {
      return this.outcome(att, 'skipped', { reason: 'not_a_page_document' });
    }

    const { kind, mime } = normalizeAttachmentType(att.fileExt, att.mimeType);
    const row = await this.store.findRow(att.id);
    const current =
      !!row &&
      row.extractorVersion === EXTRACTOR_VERSION &&
      sameInstant(row.sourceUpdatedAt, att.updatedAt) &&
      Number(row.sourceSize ?? -1) === Number(att.fileSize ?? -1);

    let knownNeedsOcr = false;
    if (current) {
      const cached = await this.fromCurrentRow(att, row, opts);
      if (cached) return cached;
      knownNeedsOcr =
        row.status === 'needs_ocr' || row.status === 'ocr_running';
    }

    if (kind === 'unsupported') {
      return this.persist(
        att,
        row,
        { status: 'unsupported', method: null },
        null,
        'unsupported_type',
      );
    }

    const declaredSize = Number(att.fileSize ?? 0);
    if (declaredSize > MAX_SOURCE_BYTES) {
      return this.persist(
        att,
        row,
        { status: 'too_large', method: null },
        null,
        'source_size_limit',
      );
    }

    // Images have no native text: at upload time just record that OCR is
    // pending, without downloading the bytes.
    if (kind === 'image' && !opts.allowOcr) {
      return this.persist(
        att,
        row,
        { status: 'needs_ocr', method: null, pageCount: 1 },
        null,
      );
    }

    let bytes: Buffer;
    try {
      bytes = await this.storage.read(att.filePath);
    } catch (err) {
      if (isStorageObjectNotFound(err)) {
        return this.persist(
          att,
          row,
          {
            status: 'failed',
            method: null,
            attempts: MAX_FAILED_RUNS,
            lastError: 'source file missing from storage',
          },
          null,
          'missing_source',
        );
      }
      // Storage outage / auth error: nothing learned about the file, retry later.
      throw err;
    }
    if (bytes.length > MAX_SOURCE_BYTES) {
      return this.persist(
        att,
        row,
        { status: 'too_large', method: null },
        null,
        'source_size_limit',
      );
    }

    const sourceSha256 = sha256(bytes);

    // Same bytes as last time (e.g. only the row was touched): keep the
    // result, unless it still has scanned pages waiting for OCR.
    if (
      row &&
      row.extractorVersion === EXTRACTOR_VERSION &&
      row.sourceSha256 === sourceSha256 &&
      (['extracted', 'empty', 'unsupported'].includes(row.status) ||
        (row.status === 'partial' && !hasPagesAwaitingOcr(row.detail)))
    ) {
      const withText = row.status === 'extracted' || row.status === 'partial';
      return this.persist(
        att,
        row,
        {
          status: row.status as ExtractionStatus,
          method: row.method as ExtractionMethod | null,
          sourceSha256,
          pageCount: row.pageCount,
        },
        withText ? await this.loadText(att) : null,
        row.detail ?? undefined,
        'cache',
      );
    }

    const dedup = await this.store.findDuplicate(
      att.workspaceId,
      sourceSha256,
      att.id,
      EXTRACTOR_VERSION,
    );
    if (dedup) {
      return this.persist(
        att,
        row,
        {
          status: dedup.status as ExtractionStatus,
          method: dedup.method as ExtractionMethod | null,
          sourceSha256,
          pageCount: dedup.pageCount,
        },
        dedup.textContent ?? null,
        dedup.detail ?? undefined,
        'dedup',
      );
    }

    const native: NativeExtractionResult = knownNeedsOcr
      ? { status: 'needs_ocr', text: null, pageCount: row?.pageCount ?? null }
      : await this.nativeExtract(bytes, kind);

    switch (native.status) {
      case 'empty':
      case 'unsupported':
      case 'too_large':
        return this.persist(
          att,
          row,
          {
            status: native.status,
            method: 'native',
            sourceSha256,
            pageCount: native.pageCount,
          },
          null,
          native.reason,
        );
      case 'failed':
        // A corrupt or unreadable file fails identically on every retry.
        return this.persist(
          att,
          row,
          {
            status: 'failed',
            method: 'native',
            sourceSha256,
            attempts: MAX_FAILED_RUNS,
            lastError: native.reason ?? 'unreadable',
          },
          null,
          native.reason,
        );
      case 'extracted':
        if (kind === 'pdf' && native.textlessPages?.length) {
          return this.completeMixedPdf(
            att,
            row,
            { mime, bytes, sourceSha256, native },
            opts,
          );
        }
        return this.persist(
          att,
          row,
          {
            status: native.partial ? 'partial' : 'extracted',
            method: 'native',
            sourceSha256,
            pageCount: native.pageCount,
          },
          native.text,
          native.partial,
        );
      default:
        return this.runOcr(
          att,
          row,
          { kind, mime, bytes, sourceSha256, pageCount: native.pageCount },
          opts,
        );
    }
  }

  /** Cached outcome for a row that matches the attachment's current bytes, or null to (re)process. */
  private async fromCurrentRow(
    att: ExtractableAttachment,
    row: ExtractionRow,
    opts: { allowOcr: boolean },
  ): Promise<ExtractionOutcome | null> {
    const cached = (
      status: ExtractionOutcome['status'],
      text: string | null,
      reason: string | undefined = row.detail ?? undefined,
    ): ExtractionOutcome => ({
      attachmentId: att.id,
      status,
      method: row.method as ExtractionMethod | null,
      text,
      textSha256: text ? row.textSha256 : null,
      reused: 'cache',
      ocrPagesBilled: 0,
      reason,
    });
    const ocrAllowed = opts.allowOcr && this.ai.isOcrAvailable();

    switch (row.status) {
      case 'extracted':
        return cached('extracted', await this.loadText(att));
      case 'partial':
        if (
          hasPagesAwaitingOcr(row.detail) &&
          ocrAllowed &&
          row.attempts < MAX_FAILED_RUNS
        ) {
          return null; // fill the scanned pages now
        }
        return cached('partial', await this.loadText(att));
      case 'empty':
      case 'unsupported':
      case 'too_large':
        return cached(row.status, null);
      case 'failed':
        if (row.attempts >= MAX_FAILED_RUNS) {
          return cached('failed', null, 'retry_limit');
        }
        if (!opts.allowOcr && row.method === 'ocr')
          return cached('failed', null);
        return null;
      case 'needs_ocr':
        if (!opts.allowOcr) return cached('needs_ocr', null);
        if (!this.ai.isOcrAvailable()) {
          return cached('needs_ocr', null, 'ocr_unavailable');
        }
        return null;
      case 'ocr_running':
        if (Date.now() - new Date(row.updatedAt).getTime() < OCR_LEASE_MS) {
          return cached('busy', null);
        }
        if (!opts.allowOcr) return cached('needs_ocr', null);
        return null;
      default:
        return null;
    }
  }

  /** Whole-document OCR: images and PDFs without a usable text layer. */
  private async runOcr(
    att: ExtractableAttachment,
    row: ExtractionRow | undefined,
    src: {
      kind: AttachmentKind;
      mime: string;
      bytes: Buffer;
      sourceSha256: string;
      pageCount: number | null;
    },
    opts: { allowOcr: boolean; ocrBudget?: { remaining: number } },
  ): Promise<ExtractionOutcome> {
    const { kind, mime, bytes, sourceSha256, pageCount } = src;
    const pending: PersistFields = {
      status: 'needs_ocr',
      method: null,
      sourceSha256,
      pageCount,
    };

    if (kind === 'image' && bytes.length < MIN_OCR_IMAGE_BYTES) {
      return this.persist(
        att,
        row,
        { status: 'empty', method: null, sourceSha256, pageCount: 1 },
        null,
        'image_too_small',
      );
    }
    const limit = kind === 'image' ? MAX_OCR_IMAGE_BYTES : MAX_OCR_PDF_BYTES;
    if (bytes.length > limit) {
      return this.persist(
        att,
        row,
        { status: 'too_large', method: null, sourceSha256, pageCount },
        null,
        'ocr_size_limit',
      );
    }
    if (!opts.allowOcr) return this.persist(att, row, pending, null);
    if (!this.ai.isOcrAvailable()) {
      return this.persist(att, row, pending, null, 'ocr_unavailable');
    }
    if (kind === 'pdf' && !pageCount) {
      // Without a page count the request cannot be bounded; refuse to guess.
      return this.persist(
        att,
        row,
        {
          status: 'failed',
          method: 'ocr',
          sourceSha256,
          attempts: MAX_FAILED_RUNS,
          lastError: 'unknown page count',
        },
        null,
        'unknown_page_count',
      );
    }
    if (opts.ocrBudget && opts.ocrBudget.remaining <= 0) {
      const o = await this.persist(att, row, pending, null);
      return { ...o, status: o.status === 'needs_ocr' ? 'deferred' : o.status };
    }

    const pagesToOcr = kind === 'pdf' ? Math.min(pageCount, MAX_OCR_PAGES) : 1;
    const pages =
      kind === 'pdf'
        ? Array.from({ length: pagesToOcr }, (_, i) => i)
        : undefined;

    const claim = await this.claim(att, sourceSha256, pageCount, opts);
    if (!claim) return this.outcome(att, 'busy');

    const result = await this.callOcr(att, bytes, mime, pages);
    if (!result.value) {
      return this.persistOcrFailure(
        att,
        row,
        sourceSha256,
        pageCount,
        result.error,
        claim,
        null,
        null,
      );
    }

    const joined = normalizeExtractedText(
      [...result.value.pages]
        .sort((a, b) => a.index - b.index)
        .map((p) => cleanOcrMarkdown(p.markdown))
        .join('\n\n'),
    );
    const text = joined.slice(0, MAX_EXTRACTED_CHARS);
    const billed = result.value.pagesProcessed || pagesToOcr;
    const coverage = joinReasons(
      kind === 'pdf' && pageCount > MAX_OCR_PAGES
        ? `ocr_page_limit:${MAX_OCR_PAGES}/${pageCount}`
        : undefined,
      joined.length > MAX_EXTRACTED_CHARS ? 'char_limit' : undefined,
    );
    this.logger.log(
      `OCR attachment ${att.id}: ${billed} page(s), ${text.length} chars`,
    );
    const o = await this.persist(
      att,
      row,
      {
        status: !text ? 'empty' : coverage ? 'partial' : 'extracted',
        method: 'ocr',
        sourceSha256,
        pageCount,
        ocrPages: billed,
        claimToken: claim,
      },
      text || null,
      coverage,
    );
    return { ...o, ocrPagesBilled: billed };
  }

  /**
   * A PDF with a real text layer on some pages and scanned pages elsewhere:
   * keep the native text and OCR only the textless pages (bounded). Without
   * OCR the result is honestly `partial` and is completed by a later pass.
   */
  private async completeMixedPdf(
    att: ExtractableAttachment,
    row: ExtractionRow | undefined,
    src: {
      mime: string;
      bytes: Buffer;
      sourceSha256: string;
      native: NativeExtractionResult;
    },
    opts: { allowOcr: boolean; ocrBudget?: { remaining: number } },
  ): Promise<ExtractionOutcome> {
    const { mime, bytes, sourceSha256, native } = src;
    const pageCount = native.pageCount;
    const textless = native.textlessPages ?? [];
    const otherLimits =
      (native.partial ?? '')
        .split(',')
        .filter((r) => r && !r.startsWith('pages_without_text'))
        .join(',') || undefined;
    const nativeOnly = (detail = native.partial) =>
      this.persist(
        att,
        row,
        { status: 'partial', method: 'native', sourceSha256, pageCount },
        native.text,
        detail,
      );

    if (
      !opts.allowOcr ||
      !this.ai.isOcrAvailable() ||
      bytes.length > MAX_OCR_PDF_BYTES
    ) {
      return nativeOnly(
        joinReasons(
          native.partial,
          bytes.length > MAX_OCR_PDF_BYTES ? 'ocr_size_limit' : undefined,
        ),
      );
    }
    if (opts.ocrBudget && opts.ocrBudget.remaining <= 0) {
      const o = await nativeOnly();
      return { ...o, status: o.status === 'partial' ? 'deferred' : o.status };
    }

    const claim = await this.claim(att, sourceSha256, pageCount, opts);
    if (!claim) return this.outcome(att, 'busy');

    const pages = textless.slice(0, MAX_OCR_PAGES);
    const result = await this.callOcr(att, bytes, mime, pages);
    if (!result.value) {
      return this.persistOcrFailure(
        att,
        row,
        sourceSha256,
        pageCount,
        result.error,
        claim,
        native.text,
        native.partial,
      );
    }

    const perPage = [...(native.pageTexts ?? [])];
    for (const p of result.value.pages) {
      if (pages.includes(p.index))
        perPage[p.index] = cleanOcrMarkdown(p.markdown);
    }
    const joined = normalizeExtractedText(perPage.join('\n\n'));
    const text = joined.slice(0, MAX_EXTRACTED_CHARS);
    const remaining = textless.length - pages.length;
    const coverage = joinReasons(
      otherLimits,
      remaining > 0
        ? `pages_without_text:${remaining}/${pageCount}`
        : undefined,
      remaining > 0
        ? `ocr_page_limit:${pages.length}/${textless.length}`
        : undefined,
      joined.length > MAX_EXTRACTED_CHARS ? 'char_limit' : undefined,
    );
    const billed = result.value.pagesProcessed || pages.length;
    const o = await this.persist(
      att,
      row,
      {
        status: coverage ? 'partial' : 'extracted',
        method: 'native+ocr',
        sourceSha256,
        pageCount,
        ocrPages: billed,
        // Remaining scanned pages beyond the OCR cap are not retried.
        attempts: remaining > 0 ? MAX_FAILED_RUNS : 0,
        claimToken: claim,
      },
      text,
      coverage,
    );
    return { ...o, ocrPagesBilled: billed };
  }

  private async claim(
    att: ExtractableAttachment,
    sourceSha256: string,
    pageCount: number | null,
    opts: { ocrBudget?: { remaining: number } },
  ): Promise<string | null> {
    const token = await this.store.claimOcr(
      att,
      { sourceSha256, pageCount, extractorVersion: EXTRACTOR_VERSION },
      OCR_LEASE_MS,
    );
    if (token && opts.ocrBudget) opts.ocrBudget.remaining--;
    return token;
  }

  /** One bounded OCR run: retries transient errors with backoff. */
  private async callOcr(
    att: ExtractableAttachment,
    bytes: Buffer,
    mime: string,
    pages: number[] | undefined,
  ): Promise<{ value?: OcrResult; error?: unknown }> {
    let lastErr: unknown;
    for (let tryNo = 1; tryNo <= OCR_TRIES_PER_RUN; tryNo++) {
      try {
        const value = await this.ai.ocrDocument({
          data: bytes,
          mimeType: mime,
          pages,
          timeoutMs: OCR_TIMEOUT_MS,
        });
        return { value };
      } catch (err) {
        lastErr = err;
        const retryable =
          err instanceof OcrProviderError ? err.retryable : true;
        if (!retryable || tryNo === OCR_TRIES_PER_RUN) break;
        await this.delay(2_000 * 4 ** (tryNo - 1));
      }
    }
    this.logger.warn(
      `OCR failed for attachment ${att.id}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
    return { error: lastErr ?? new Error('OCR failed') };
  }

  private persistOcrFailure(
    att: ExtractableAttachment,
    row: ExtractionRow | undefined,
    sourceSha256: string,
    pageCount: number | null,
    error: unknown,
    claimToken: string,
    keptText: string | null,
    keptDetail: string | undefined,
  ): Promise<ExtractionOutcome> {
    // A rejected document (400/413/422...) fails the same way forever; a
    // transient error or a credential problem (401/403, fixed by an operator)
    // counts as one failed run and may be retried by a later pass.
    const retryable =
      !(error instanceof OcrProviderError) ||
      error.retryable ||
      error.status === 401 ||
      error.status === 403;
    const previousAttempts =
      row?.sourceSha256 === sourceSha256 ? (row?.attempts ?? 0) : 0;
    const message = error instanceof Error ? error.message : String(error);
    const reason = retryable ? 'ocr_provider_error' : 'ocr_rejected';
    return this.persist(
      att,
      row,
      {
        // Native text of a mixed PDF is kept (still marked partial).
        status: keptText ? 'partial' : 'failed',
        method: keptText ? 'native' : 'ocr',
        sourceSha256,
        pageCount,
        attempts: retryable ? previousAttempts + 1 : MAX_FAILED_RUNS,
        lastError: message.slice(0, 500),
        claimToken,
      },
      keptText,
      keptText ? joinReasons(keptDetail, reason) : reason,
    );
  }

  /** Seam for tests (Jest's VM cannot load the pdfjs ESM build). */
  protected nativeExtract(
    bytes: Buffer,
    kind: AttachmentKind,
  ): Promise<NativeExtractionResult> {
    return extractNativeText(bytes, kind);
  }

  /** Overridable for tests. */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async loadText(att: ExtractableAttachment): Promise<string | null> {
    if (att.textContent !== undefined) return att.textContent;
    return this.store.loadText(att.id);
  }

  private outcome(
    att: ExtractableAttachment,
    status: ExtractionOutcome['status'],
    extra: Partial<ExtractionOutcome> = {},
  ): ExtractionOutcome {
    return {
      attachmentId: att.id,
      status,
      method: null,
      text: null,
      textSha256: null,
      reused: null,
      ocrPagesBilled: 0,
      ...extra,
    };
  }

  /**
   * Stores the outcome. attachments.text_content is only written while the
   * attachment still has the bytes that were processed (same updated_at), an
   * OCR result only while its claim is still the current one, and a non-OCR
   * write never clobbers another worker's fresh OCR claim.
   */
  private async persist(
    att: ExtractableAttachment,
    row: ExtractionRow | undefined,
    fields: PersistFields,
    text: string | null,
    reason?: string,
    reused: 'cache' | 'dedup' | null = null,
  ): Promise<ExtractionOutcome> {
    const textSha256 = text ? sha256(text) : null;
    const attempts =
      fields.attempts ??
      (row && row.sourceSha256 && row.sourceSha256 === fields.sourceSha256
        ? row.attempts
        : 0);

    const saved: SaveResult = await this.store.save(
      att,
      {
        status: fields.status,
        method: fields.method,
        sourceSha256: fields.sourceSha256 ?? null,
        sourceSize: Number(att.fileSize ?? 0),
        sourceUpdatedAt: att.updatedAt,
        textSha256,
        charCount: text?.length ?? 0,
        pageCount: fields.pageCount ?? null,
        ocrPages: fields.ocrPages ?? 0,
        attempts,
        lastError: fields.lastError ?? null,
        detail: reason ?? null,
        extractorVersion: EXTRACTOR_VERSION,
      },
      text,
      { claimToken: fields.claimToken, leaseMs: OCR_LEASE_MS },
    );

    if (saved === 'busy') return this.outcome(att, 'busy');
    if (saved !== 'written') {
      return this.outcome(att, 'skipped', {
        reason:
          saved === 'late' ? 'superseded_ocr_result' : 'attachment_changed',
      });
    }
    return {
      attachmentId: att.id,
      status: fields.status,
      method: fields.method,
      text,
      textSha256,
      reused,
      ocrPagesBilled: 0,
      reason,
    };
  }
}

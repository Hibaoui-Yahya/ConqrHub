import * as yauzl from 'yauzl';

/**
 * Native (local, free) text extraction for business documents attached to
 * pages. Nothing here touches the network, runs embedded scripts or macros,
 * or evaluates formulas: PDFs are parsed with pdfjs (eval disabled), Word
 * files with mammoth (raw text only), and PowerPoint/Excel files by reading
 * their XML parts out of the zip container with hard size limits.
 *
 * Images and scanned PDFs come back as `needs_ocr`; OCR is a separate, paid
 * step decided by AttachmentExtractionService.
 */

export type AttachmentKind =
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'text'
  | 'markdown'
  | 'csv'
  | 'json'
  | 'image'
  | 'unsupported';

export type NativeExtractionStatus =
  | 'extracted'
  | 'empty'
  | 'needs_ocr'
  | 'unsupported'
  | 'too_large'
  | 'failed';

export interface NativeExtractionResult {
  status: NativeExtractionStatus;
  text: string | null;
  /** Pages (PDF), slides (PPTX) or sheets (XLSX) seen; null when not paged. */
  pageCount: number | null;
  /** Short machine-readable reason for empty/unsupported/failed. */
  reason?: string;
  /** True when only part of the document is in `text` (see `partial`). */
  truncated?: boolean;
  /**
   * Why the text does not cover the whole document, e.g. `char_limit`,
   * `row_limit`, `native_page_limit:400/512` or `pages_without_text:3/10`.
   * Absent means complete coverage.
   */
  partial?: string;
  /** PDF only: per-page text, and 0-based pages with no usable text layer. */
  pageTexts?: string[];
  textlessPages?: number[];
}

/** Characters kept from one attachment (≈ 40 pages of dense prose). */
export const MAX_EXTRACTED_CHARS = 150_000;
/** PDF pages read natively. */
export const MAX_NATIVE_PDF_PAGES = 400;
/** Below this many non-blank characters per page a PDF is treated as scanned. */
export const SCANNED_PDF_MIN_CHARS_PER_PAGE = 25;
/** Zip containers (docx/pptx/xlsx): entry count and inflated-bytes ceilings. */
export const MAX_ZIP_ENTRIES = 5_000;
export const MAX_ZIP_ENTRY_BYTES = 20 * 1024 * 1024;
export const MAX_ZIP_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_SHEET_ROWS = 5_000;

const MIME_BY_EXT: Record<string, { mime: string; kind: AttachmentKind }> = {
  pdf: { mime: 'application/pdf', kind: 'pdf' },
  docx: {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'docx',
  },
  pptx: {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    kind: 'pptx',
  },
  xlsx: {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    kind: 'xlsx',
  },
  txt: { mime: 'text/plain', kind: 'text' },
  text: { mime: 'text/plain', kind: 'text' },
  log: { mime: 'text/plain', kind: 'text' },
  md: { mime: 'text/markdown', kind: 'markdown' },
  markdown: { mime: 'text/markdown', kind: 'markdown' },
  csv: { mime: 'text/csv', kind: 'csv' },
  tsv: { mime: 'text/tab-separated-values', kind: 'csv' },
  json: { mime: 'application/json', kind: 'json' },
  png: { mime: 'image/png', kind: 'image' },
  jpg: { mime: 'image/jpeg', kind: 'image' },
  jpeg: { mime: 'image/jpeg', kind: 'image' },
  webp: { mime: 'image/webp', kind: 'image' },
};

const KIND_BY_MIME: Record<string, AttachmentKind> = Object.fromEntries(
  Object.values(MIME_BY_EXT).map((v) => [v.mime, v.kind]),
);
// Aliases browsers and OSes commonly send.
Object.assign(KIND_BY_MIME, {
  'application/x-pdf': 'pdf',
  'text/x-markdown': 'markdown',
  'application/csv': 'csv',
  'text/comma-separated-values': 'csv',
  'text/json': 'json',
  'image/jpg': 'image',
  'image/pjpeg': 'image',
});

/**
 * Supported kind and canonical MIME type of an attachment. The extension wins
 * over the stored MIME type (it is what the upload pipeline derives the MIME
 * from); the MIME type is only consulted when the extension is unknown.
 * Legacy binary Office formats (.doc/.xls/.ppt), macro-enabled formats
 * (.docm/.xlsm/.pptm), SVG, archives and media are unsupported.
 */
export function normalizeAttachmentType(
  fileExt: string | null | undefined,
  mimeType: string | null | undefined,
): { kind: AttachmentKind; mime: string } {
  const ext = (fileExt ?? '').toLowerCase().replace(/^\./, '').trim();
  const byExt = MIME_BY_EXT[ext];
  if (byExt) return { kind: byExt.kind, mime: byExt.mime };
  const mime = (mimeType ?? '').toLowerCase().split(';')[0].trim();
  if (!ext || ext === 'bin') {
    const kind = KIND_BY_MIME[mime];
    if (kind) return { kind, mime: MIME_BY_EXT[extFor(kind)]?.mime ?? mime };
  }
  return { kind: 'unsupported', mime: mime || 'application/octet-stream' };
}

function extFor(kind: AttachmentKind): string {
  return (
    Object.entries(MIME_BY_EXT).find(([, v]) => v.kind === kind)?.[0] ?? ''
  );
}

export function isOcrCandidateKind(kind: AttachmentKind): boolean {
  return kind === 'image' || kind === 'pdf';
}

/** Collapses runs of blank space while keeping paragraph breaks. */
export function normalizeExtractedText(text: string): string {
  return (
    text
      .replace(/\r\n?/g, '\n')
      // Control characters other than tab/newline are never meaningful text.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      // Tabs are kept: they separate spreadsheet / TSV columns.
      .replace(/[ \u00A0]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

function meaningfulChars(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function cap(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_EXTRACTED_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_EXTRACTED_CHARS), truncated: true };
}

function done(
  raw: string,
  pageCount: number | null,
  partial?: string,
): NativeExtractionResult {
  const normalized = normalizeExtractedText(raw);
  if (!normalized) {
    return { status: 'empty', text: null, pageCount, reason: 'blank' };
  }
  const capped = cap(normalized);
  const why = partial ?? (capped.truncated ? 'char_limit' : undefined);
  return {
    status: 'extracted',
    text: capped.text,
    pageCount,
    truncated: !!why,
    ...(why ? { partial: why } : {}),
  };
}

/**
 * The extractor itself could not run (e.g. the pdfjs module failed to load).
 * Says nothing about the file, so it is rethrown for a later retry instead of
 * being recorded as a corrupt document.
 */
export class ExtractorUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractorUnavailableError';
  }
}

export async function extractNativeText(
  buf: Buffer,
  kind: AttachmentKind,
  deps: { loadPdfjs?: () => Promise<any> } = {},
): Promise<NativeExtractionResult> {
  try {
    switch (kind) {
      case 'text':
      case 'markdown':
      case 'csv':
      case 'json':
        return extractPlainText(buf);
      case 'pdf':
        return await extractPdf(buf, deps.loadPdfjs ?? loadPdfjs);
      case 'docx':
        return await extractDocx(buf);
      case 'pptx':
        return await extractPptx(buf);
      case 'xlsx':
        return await extractXlsx(buf);
      case 'image':
        return { status: 'needs_ocr', text: null, pageCount: 1 };
      default:
        return {
          status: 'unsupported',
          text: null,
          pageCount: null,
          reason: 'unsupported_type',
        };
    }
  } catch (err) {
    if (err instanceof ExtractorUnavailableError) throw err;
    return {
      status: 'failed',
      text: null,
      pageCount: null,
      reason:
        `corrupt: ${err instanceof Error ? err.message : String(err)}`.slice(
          0,
          300,
        ),
    };
  }
}

function extractPlainText(buf: Buffer): NativeExtractionResult {
  // A NUL byte in the first 8 KB means this is not a text file whatever its
  // extension says; refuse rather than index binary garbage.
  if (buf.subarray(0, 8192).includes(0)) {
    return {
      status: 'failed',
      text: null,
      pageCount: null,
      reason: 'corrupt: binary content in a text file',
    };
  }
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return done(text, null);
}

/**
 * The server compiles to CommonJS, which turns `import()` into `require()` and
 * cannot load pdfjs' ESM build; this indirection keeps a real dynamic import.
 */
const esmImport = new Function('m', 'return import(m)') as (
  m: string,
) => Promise<any>;

function loadPdfjs(): Promise<any> {
  return esmImport('pdfjs-dist/legacy/build/pdf.mjs');
}

async function extractPdf(
  buf: Buffer,
  load: () => Promise<any>,
): Promise<NativeExtractionResult> {
  let pdfjs: any;
  try {
    pdfjs = await load();
  } catch (err) {
    throw new ExtractorUnavailableError(
      `pdfjs unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  let doc: any;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(data),
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
      stopAtErrors: false,
    }).promise;
  } catch (err) {
    if ((err as { name?: string })?.name === 'PasswordException') {
      return {
        status: 'unsupported',
        text: null,
        pageCount: null,
        reason: 'encrypted_pdf',
      };
    }
    throw err;
  }

  try {
    const pageCount: number = doc.numPages;
    const pagesToRead = Math.min(pageCount, MAX_NATIVE_PDF_PAGES);
    const parts: string[] = [];
    let chars = 0;
    let stoppedOnChars = false;
    for (let i = 1; i <= pagesToRead; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const pageText = tc.items
        .map((it: any) =>
          typeof it.str === 'string' ? it.str + (it.hasEOL ? '\n' : ' ') : '',
        )
        .join('')
        .trim();
      parts.push(pageText);
      chars += pageText.length;
      if (chars >= MAX_EXTRACTED_CHARS) {
        stoppedOnChars = i < pagesToRead;
        break;
      }
    }

    const text = parts.join('\n\n');
    const examined = Math.max(1, parts.length);
    if (meaningfulChars(text) < SCANNED_PDF_MIN_CHARS_PER_PAGE * examined) {
      // Image-only (scanned) or near-empty text layer: only OCR can read it.
      return {
        status: 'needs_ocr',
        text: null,
        pageCount,
        reason: 'no_text_layer',
      };
    }
    // Mixed documents: pages whose text layer is (nearly) empty are scanned
    // pages. They are reported, never silently counted as read.
    const textlessPages = parts
      .map((t, i) =>
        meaningfulChars(t) < SCANNED_PDF_MIN_CHARS_PER_PAGE ? i : -1,
      )
      .filter((i) => i >= 0);
    const reasons: string[] = [];
    if (pageCount > parts.length || stoppedOnChars) {
      reasons.push(`native_page_limit:${parts.length}/${pageCount}`);
    }
    if (textlessPages.length) {
      reasons.push(`pages_without_text:${textlessPages.length}/${pageCount}`);
    }
    return {
      ...done(text, pageCount, reasons.length ? reasons.join(',') : undefined),
      pageTexts: parts,
      textlessPages,
    };
  } finally {
    try {
      await doc.destroy();
    } catch {
      /* ignore cleanup errors */
    }
  }
}

async function extractDocx(buf: Buffer): Promise<NativeExtractionResult> {
  // mammoth only reads document XML: no macros (and .docm is not accepted),
  // no external relationships fetched.
  let mammoth: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mammoth = require('mammoth');
  } catch (err) {
    throw new ExtractorUnavailableError(
      `mammoth unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // mammoth (JSZip) inflates parts fully in memory. Measure the real
  // inflated size of every entry first, with hard caps, so a small but highly
  // compressed document cannot exhaust memory.
  const preflight = await measureZip(buf);
  if (!preflight.ok) {
    return {
      status: 'too_large',
      text: null,
      pageCount: null,
      reason: preflight.reason,
    };
  }
  const result = await mammoth.extractRawText({ buffer: buf });
  return done(result?.value ?? '', null);
}

/**
 * Streams every zip entry through the inflater, counting actual bytes (the
 * sizes declared in the zip headers are not trusted), and stops at the first
 * limit crossed. Nothing is kept in memory. Corrupt archives reject.
 */
export function measureZip(
  buf: Buffer,
  limits: { entries?: number; entryBytes?: number; totalBytes?: number } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const maxEntries = limits.entries ?? MAX_ZIP_ENTRIES;
  const maxEntry = limits.entryBytes ?? MAX_ZIP_ENTRY_BYTES;
  const maxTotal = limits.totalBytes ?? MAX_ZIP_TOTAL_BYTES;
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('invalid zip'));
      if (zip.entryCount > maxEntries) {
        zip.close();
        return resolve({ ok: false, reason: 'zip_entry_count_limit' });
      }
      let total = 0;
      let settled = false;
      const finish = (v: { ok: boolean; reason?: string }) => {
        if (settled) return;
        settled = true;
        try {
          zip.close();
        } catch {
          /* ignore */
        }
        resolve(v);
      };
      const fail = (e: Error) => {
        if (settled) return;
        settled = true;
        reject(e);
      };
      zip.on('error', fail);
      zip.on('end', () => finish({ ok: true }));
      zip.on('entry', (entry: yauzl.Entry) => {
        if (settled) return;
        if (entry.fileName.endsWith('/')) return zip.readEntry();
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return fail(e ?? new Error('zip read failed'));
          let size = 0;
          stream.on('data', (c: Buffer) => {
            size += c.length;
            total += c.length;
            if (size > maxEntry || total > maxTotal) {
              stream.destroy();
              finish({ ok: false, reason: 'inflated_size_limit' });
            }
          });
          stream.on('error', (se) => {
            if (!settled) fail(se);
          });
          stream.on('end', () => {
            if (!settled) zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

// ---------------------------------------------------------------------------
// Office Open XML containers (pptx / xlsx)
// ---------------------------------------------------------------------------

/**
 * Reads the zip entries whose names match `wanted`, refusing archives with
 * too many entries or inflating past the byte ceilings (zip bombs).
 */
export function readZipEntries(
  buf: Buffer,
  wanted: (name: string) => boolean,
): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buf,
      { lazyEntries: true, validateEntrySizes: true },
      (err, zip) => {
        if (err || !zip) return reject(err ?? new Error('invalid zip'));
        if (zip.entryCount > MAX_ZIP_ENTRIES) {
          zip.close();
          return reject(new Error('too many zip entries'));
        }
        const out = new Map<string, Buffer>();
        let total = 0;
        let failed = false;
        const fail = (e: Error) => {
          if (failed) return;
          failed = true;
          try {
            zip.close();
          } catch {
            /* ignore */
          }
          reject(e);
        };
        zip.on('error', fail);
        zip.on('end', () => {
          if (!failed) resolve(out);
        });
        zip.on('entry', (entry: yauzl.Entry) => {
          if (failed) return;
          const name = entry.fileName;
          if (name.endsWith('/') || !wanted(name)) {
            zip.readEntry();
            return;
          }
          if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
            return fail(new Error(`zip entry too large: ${name}`));
          }
          total += entry.uncompressedSize;
          if (total > MAX_ZIP_TOTAL_BYTES) {
            return fail(new Error('zip content too large'));
          }
          zip.openReadStream(entry, (e, stream) => {
            if (e || !stream) return fail(e ?? new Error('zip read failed'));
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on('data', (c: Buffer) => {
              size += c.length;
              if (size > MAX_ZIP_ENTRY_BYTES) {
                stream.destroy();
                fail(new Error(`zip entry too large: ${name}`));
                return;
              }
              chunks.push(c);
            });
            stream.on('error', fail);
            stream.on('end', () => {
              if (failed) return;
              out.set(name, Buffer.concat(chunks));
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}

export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    const k = String(e).toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const code = k.startsWith('#x')
      ? parseInt(k.slice(2), 16)
      : parseInt(k.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : m;
  });
}

function numericSuffix(name: string): number {
  const m = /(\d+)\.xml$/.exec(name);
  return m ? Number(m[1]) : 0;
}

async function extractPptx(buf: Buffer): Promise<NativeExtractionResult> {
  const slideRe = /^ppt\/slides\/slide\d+\.xml$/;
  const notesRe = /^ppt\/notesSlides\/notesSlide\d+\.xml$/;
  const entries = await readZipEntries(
    buf,
    (n) => slideRe.test(n) || notesRe.test(n),
  );
  const slides = [...entries.keys()]
    .filter((n) => slideRe.test(n))
    .sort((a, b) => numericSuffix(a) - numericSuffix(b));
  if (slides.length === 0) {
    return {
      status: 'failed',
      text: null,
      pageCount: 0,
      reason: 'corrupt: no slides',
    };
  }

  const paragraphs = (xml: string): string =>
    xml
      .split(/<\/a:p>/)
      .map((p) =>
        [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
          .map((m) => decodeXmlEntities(m[1]))
          .join(''),
      )
      .filter((t) => t.trim())
      .join('\n');

  const parts = slides.map((name, i) => {
    const body = paragraphs(entries.get(name)!.toString('utf8'));
    const notesName = `ppt/notesSlides/notesSlide${numericSuffix(name)}.xml`;
    const notes = entries.has(notesName)
      ? paragraphs(entries.get(notesName)!.toString('utf8'))
      : '';
    const lines = [`Slide ${i + 1}`];
    if (body) lines.push(body);
    if (notes) lines.push(`Notes: ${notes}`);
    return lines.join('\n');
  });
  const anyText = parts.some((p) => p.includes('\n'));
  if (!anyText) {
    return {
      status: 'empty',
      text: null,
      pageCount: slides.length,
      reason: 'blank',
    };
  }
  return done(parts.join('\n\n'), slides.length);
}

async function extractXlsx(buf: Buffer): Promise<NativeExtractionResult> {
  const sheetRe = /^xl\/worksheets\/sheet\d+\.xml$/;
  const entries = await readZipEntries(
    buf,
    (n) =>
      sheetRe.test(n) ||
      n === 'xl/sharedStrings.xml' ||
      n === 'xl/workbook.xml' ||
      n === 'xl/_rels/workbook.xml.rels',
  );

  const shared: string[] = [];
  const sst = entries.get('xl/sharedStrings.xml')?.toString('utf8');
  if (sst) {
    for (const si of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(
        [...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
          .map((m) => decodeXmlEntities(m[1]))
          .join(''),
      );
    }
  }

  // Sheet display names, mapped through the workbook relationships.
  const names = new Map<string, string>();
  const wb = entries.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rels =
    entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';
  const targetById = new Map<string, string>();
  for (const r of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(r[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(r[1])?.[1];
    if (id && target) {
      targetById.set(
        id,
        `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}`,
      );
    }
  }
  for (const s of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = /\bname="([^"]*)"/.exec(s[1])?.[1];
    const rid = /\br:id="([^"]+)"/.exec(s[1])?.[1];
    const target = rid ? targetById.get(rid) : undefined;
    if (name && target) names.set(target, decodeXmlEntities(name));
  }

  const sheets = [...entries.keys()]
    .filter((n) => sheetRe.test(n))
    .sort((a, b) => numericSuffix(a) - numericSuffix(b));
  if (sheets.length === 0) {
    return {
      status: 'failed',
      text: null,
      pageCount: 0,
      reason: 'corrupt: no worksheets',
    };
  }

  let rowLimited = false;
  const parts: string[] = [];
  for (const sheet of sheets) {
    const xml = entries.get(sheet)!.toString('utf8');
    const lines: string[] = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (lines.length >= MAX_SHEET_ROWS) {
        rowLimited = true;
        break;
      }
      const cells: string[] = [];
      for (const c of row[1].matchAll(
        /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const attrs = c[1] ?? '';
        const inner = c[2] ?? '';
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
        let value = '';
        if (type === 'inlineStr') {
          value = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
            .map((m) => decodeXmlEntities(m[1]))
            .join('');
        } else {
          // Cached value only: formulas are never evaluated.
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          if (v != null) {
            value =
              type === 's' ? (shared[Number(v)] ?? '') : decodeXmlEntities(v);
          }
        }
        cells.push(value.replace(/[\t\n]+/g, ' '));
      }
      while (cells.length && !cells[cells.length - 1].trim()) cells.pop();
      if (cells.some((v) => v.trim())) lines.push(cells.join('\t'));
    }
    if (lines.length) {
      parts.push(
        `Sheet: ${names.get(sheet) ?? sheet.replace(/^.*\//, '')}\n${lines.join('\n')}`,
      );
    }
  }
  if (parts.length === 0) {
    return {
      status: 'empty',
      text: null,
      pageCount: sheets.length,
      reason: 'blank',
    };
  }
  return done(
    parts.join('\n\n'),
    sheets.length,
    rowLimited ? 'row_limit' : undefined,
  );
}

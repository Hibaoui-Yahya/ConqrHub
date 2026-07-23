import { Logger } from '@nestjs/common';

const logger = new Logger('DocumentExtract');

// Bound the work + payload: large PDFs/Docs would otherwise blow up latency and
// the chat message. First N pages, capped total characters.
const MAX_PDF_PAGES = 100;
export const MAX_EXTRACT_CHARS = 30000;

/**
 * The server tsconfig emits CommonJS, which downlevels `import()` to `require()`
 * and breaks loading of pure-ESM modules (pdfjs' .mjs build). This Function
 * indirection preserves a real dynamic ESM import at runtime.
 */
const esmImport = new Function('m', 'return import(m)') as (
  m: string,
) => Promise<any>;

/**
 * Extract plain text from a PDF or Word (.docx) document buffer for the model to
 * read. Uses pdfjs-dist (PDF) and mammoth (docx) — both already project deps.
 * Returns null when the type is unsupported or extraction fails, so callers can
 * fall back gracefully. Best-effort: scanned/image-only PDFs yield little/no text.
 */
export async function extractDocumentText(
  buf: Buffer,
  mime: string,
  ext: string | null,
): Promise<string | null> {
  const e = (ext ?? '').toLowerCase().replace(/^\./, '');
  const isPdf = mime === 'application/pdf' || e === 'pdf';
  const isDocx =
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    e === 'docx';

  try {
    if (isPdf) return await extractPdf(buf);
    if (isDocx) return await extractDocx(buf);
    return null;
  } catch (err) {
    logger.debug(
      `Document extraction failed (${mime}/${e}): ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function extractPdf(buf: Buffer): Promise<string | null> {
  const pdfjs = await esmImport('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    // Node has no DOM/canvas — text extraction doesn't need it.
    disableFontFace: true,
  }).promise;

  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  const parts: string[] = [];
  let chars = 0;
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const pageText = tc.items
      .map((it: any) => (typeof it.str === 'string' ? it.str : ''))
      .join(' ')
      .replace(/\s+\n/g, '\n')
      .trim();
    if (pageText) {
      parts.push(pageText);
      chars += pageText.length;
      if (chars >= MAX_EXTRACT_CHARS) break;
    }
  }
  try {
    await doc.destroy();
  } catch {
    /* ignore cleanup errors */
  }
  const text = parts.join('\n\n').slice(0, MAX_EXTRACT_CHARS).trim();
  return text || null;
}

async function extractDocx(buf: Buffer): Promise<string | null> {
  const mammoth = await esmImport('mammoth');
  const fn = mammoth.extractRawText ?? mammoth.default?.extractRawText;
  const result = await fn({ buffer: buf });
  const text = (result?.value ?? '').slice(0, MAX_EXTRACT_CHARS).trim();
  return text || null;
}

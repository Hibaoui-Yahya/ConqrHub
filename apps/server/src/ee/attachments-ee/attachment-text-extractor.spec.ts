import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AttachmentKind,
  ExtractorUnavailableError,
  extractNativeText,
  NativeExtractionResult,
  normalizeAttachmentType,
  readZipEntries,
  MAX_EXTRACTED_CHARS,
  MAX_ZIP_ENTRY_BYTES,
} from './attachment-text-extractor';
import {
  buildDocx,
  buildDocxBomb,
  buildPdf,
  buildPptx,
  buildXlsx,
  buildZip,
  TINY_PNG,
} from './__fixtures__/document-fixtures';

describe('normalizeAttachmentType', () => {
  it.each([
    ['.pdf', null, 'pdf', 'application/pdf'],
    ['PDF', 'application/octet-stream', 'pdf', 'application/pdf'],
    [
      '.docx',
      null,
      'docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['.md', 'text/plain', 'markdown', 'text/markdown'],
    ['.csv', 'application/vnd.ms-excel', 'csv', 'text/csv'],
    ['.json', null, 'json', 'application/json'],
    ['.txt', null, 'text', 'text/plain'],
    ['.jpeg', 'image/jpg', 'image', 'image/jpeg'],
    ['', 'application/x-pdf', 'pdf', 'application/pdf'],
  ])('%s / %s -> %s', (ext, mime, kind, canonical) => {
    expect(normalizeAttachmentType(ext, mime)).toEqual({
      kind,
      mime: canonical,
    });
  });

  it.each([
    '.doc',
    '.xls',
    '.ppt',
    '.docm',
    '.xlsm',
    '.pptm',
    '.odt',
    '.ods',
    '.odp',
    '.key',
    '.numbers',
    '.svg',
    '.zip',
    '.mp4',
    '.exe',
  ])('reports %s as unsupported, whatever MIME type is claimed', (ext) => {
    expect(normalizeAttachmentType(ext, 'application/pdf').kind).toBe(
      'unsupported',
    );
  });
});

jest.setTimeout(60_000);

/**
 * pdfjs ships only an ESM build, which Jest's VM cannot import, so real PDFs
 * are extracted in a plain Node process running the same module (tsx).
 */
function extractInNode(
  files: Array<{ kind: AttachmentKind; data: Buffer }>,
): NativeExtractionResult[] {
  const dir = mkdtempSync(join(tmpdir(), 'hub-extract-'));
  try {
    const args: string[] = [];
    files.forEach((f, i) => {
      const file = join(dir, `f${i}`);
      writeFileSync(file, f.data);
      args.push(f.kind, file);
    });
    const out = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        join(__dirname, '__fixtures__', 'extract-cli.ts'),
        ...args,
      ],
      { encoding: 'utf8', timeout: 50_000 },
    );
    return JSON.parse(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('extractNativeText — PDF in a real Node process', () => {
  let text: NativeExtractionResult;
  let scanned: NativeExtractionResult;
  let corrupt: NativeExtractionResult;
  let mixed: NativeExtractionResult;

  beforeAll(() => {
    [text, scanned, corrupt, mixed] = extractInNode([
      {
        kind: 'pdf',
        data: buildPdf([
          'Budget annuel 2026: 120 000 dollars pour le projet Atlas.',
          'Decision: Marc pilote le lancement en janvier.',
        ]),
      },
      { kind: 'pdf', data: buildPdf(['', '']) },
      { kind: 'pdf', data: Buffer.from('%PDF-1.7\nthis is not really a pdf') },
      {
        kind: 'pdf',
        data: buildPdf([
          'Contrat de service signe entre les parties le 3 mars.',
          '',
          'Annexe B: grille tarifaire applicable des le 1er avril.',
        ]),
      },
    ]);
  });

  it('reads a real text PDF across pages', () => {
    expect(text.status).toBe('extracted');
    expect(text.pageCount).toBe(2);
    expect(text.text).toContain('Budget annuel 2026');
    expect(text.text).toContain('Marc pilote le lancement');
    expect(text.partial).toBeUndefined();
    expect(text.textlessPages).toEqual([]);
  });

  it('reports the scanned page of a mixed PDF instead of claiming full coverage', () => {
    expect(mixed).toMatchObject({
      status: 'extracted',
      truncated: true,
      partial: 'pages_without_text:1/3',
      textlessPages: [1],
      pageCount: 3,
    });
    expect(mixed.pageTexts).toHaveLength(3);
    expect(mixed.text).toContain('Annexe B');
  });

  it('flags an image-only (scanned) PDF for OCR instead of indexing nothing', () => {
    expect(scanned).toMatchObject({
      status: 'needs_ocr',
      text: null,
      pageCount: 2,
    });
  });

  it('reports a corrupt PDF as failed, not as empty text', () => {
    expect(corrupt.status).toBe('failed');
    expect(corrupt.reason).toMatch(/^corrupt/);
  });
});

describe('extractNativeText', () => {
  it('reports a missing PDF engine as a retryable error, not a corrupt file', async () => {
    await expect(
      extractNativeText(buildPdf(['x']), 'pdf', {
        loadPdfjs: () => Promise.reject(new Error('module missing')),
      }),
    ).rejects.toBeInstanceOf(ExtractorUnavailableError);
  });

  it('reads a real DOCX', async () => {
    const res = await extractNativeText(
      buildDocx(['Contrat cadre', 'Échéance : 30 novembre 2026']),
      'docx',
    );
    expect(res.status).toBe('extracted');
    expect(res.text).toContain('Contrat cadre');
    expect(res.text).toContain('Échéance : 30 novembre 2026');
  });

  it('reports a DOCX with no text as empty', async () => {
    const res = await extractNativeText(buildDocx(['', '  ']), 'docx');
    expect(res.status).toBe('empty');
  });

  it('reports a truncated DOCX as failed', async () => {
    const docx = buildDocx(['Contrat']);
    const res = await extractNativeText(docx.subarray(0, 40), 'docx');
    expect(res.status).toBe('failed');
  });

  it('reads PPTX slide text and speaker notes in slide order', async () => {
    const res = await extractNativeText(
      buildPptx([
        { text: ['Plan de recrutement', 'T1 : 3 postes'] },
        { text: ['Risques & mitigation'], notes: 'Valider avec Annie' },
      ]),
      'pptx',
    );
    expect(res.status).toBe('extracted');
    expect(res.pageCount).toBe(2);
    expect(res.text).toMatch(/Slide 1\nPlan de recrutement\nT1 : 3 postes/);
    expect(res.text).toContain('Risques & mitigation');
    expect(res.text).toContain('Notes: Valider avec Annie');
  });

  it('reads XLSX cells (shared strings + cached numbers) per named sheet', async () => {
    const res = await extractNativeText(
      buildXlsx('Budget', [
        ['Poste', 'Montant'],
        ['Formation', 4500],
      ]),
      'xlsx',
    );
    expect(res.status).toBe('extracted');
    expect(res.text).toBe('Sheet: Budget\nPoste\tMontant\nFormation\t4500');
  });

  it('decodes UTF-8 text/markdown/CSV/JSON and strips a BOM', async () => {
    const md = await extractNativeText(
      Buffer.from('﻿# Procédure\n\nÉtape 1', 'utf8'),
      'markdown',
    );
    expect(md).toMatchObject({
      status: 'extracted',
      text: '# Procédure\n\nÉtape 1',
    });
    const csv = await extractNativeText(Buffer.from('a,b\n1,2\n'), 'csv');
    expect(csv.text).toBe('a,b\n1,2');
    const json = await extractNativeText(
      Buffer.from('{"client":"LTC"}'),
      'json',
    );
    expect(json.text).toBe('{"client":"LTC"}');
  });

  it('treats a blank text file as empty and binary bytes as failed', async () => {
    expect(
      (await extractNativeText(Buffer.from(' \n\n\t '), 'text')).status,
    ).toBe('empty');
    expect(
      (await extractNativeText(Buffer.from([0x41, 0x00, 0x42]), 'text')).status,
    ).toBe('failed');
  });

  it('caps very large text', async () => {
    const res = await extractNativeText(
      Buffer.from('x'.repeat(MAX_EXTRACTED_CHARS + 500)),
      'text',
    );
    expect(res.text).toHaveLength(MAX_EXTRACTED_CHARS);
    expect(res.truncated).toBe(true);
    expect(res.partial).toBe('char_limit');
  });

  it('refuses a small DOCX that would inflate past the limit, before parsing it', async () => {
    const bomb = buildDocxBomb(MAX_ZIP_ENTRY_BYTES + 1024 * 1024);
    expect(bomb.length).toBeLessThan(200 * 1024); // ~21 MB of XML in < 200 KB
    const started = Date.now();
    const res = await extractNativeText(bomb, 'docx');
    expect(res).toMatchObject({
      status: 'too_large',
      text: null,
      reason: 'inflated_size_limit',
    });
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it('does not trust the sizes declared in the zip headers', async () => {
    const liar = buildDocxBomb(MAX_ZIP_ENTRY_BYTES + 1024 * 1024, {
      declaredSize: 2048,
    });
    const res = await extractNativeText(liar, 'docx');
    expect(['too_large', 'failed']).toContain(res.status);
    expect(res.text).toBeNull();
  });

  it('still reads a normal DOCX after the preflight', async () => {
    const res = await extractNativeText(buildDocx(['Ordre du jour']), 'docx');
    expect(res).toMatchObject({ status: 'extracted', text: 'Ordre du jour' });
  });

  it('never extracts images natively: they need OCR', async () => {
    expect(await extractNativeText(TINY_PNG, 'image')).toMatchObject({
      status: 'needs_ocr',
      text: null,
    });
  });

  it('reports unsupported kinds without reading them', async () => {
    expect(
      await extractNativeText(Buffer.from('x'), 'unsupported'),
    ).toMatchObject({
      status: 'unsupported',
    });
  });
});

describe('readZipEntries limits', () => {
  it('refuses an entry that inflates beyond the per-entry ceiling (zip bomb)', async () => {
    const bomb = buildZip([
      {
        name: 'ppt/slides/slide1.xml',
        data: Buffer.alloc(21 * 1024 * 1024, 0x20),
      },
    ]);
    await expect(readZipEntries(bomb, () => true)).rejects.toThrow(/too large/);
  });

  it('only inflates the entries it was asked for', async () => {
    const zip = buildZip([
      { name: 'a.xml', data: '<a/>' },
      { name: 'big.bin', data: Buffer.alloc(21 * 1024 * 1024, 0x20) },
    ]);
    const out = await readZipEntries(zip, (n) => n === 'a.xml');
    expect([...out.keys()]).toEqual(['a.xml']);
  });
});

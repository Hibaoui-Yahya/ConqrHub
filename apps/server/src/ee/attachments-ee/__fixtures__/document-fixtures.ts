import { crc32, deflateRawSync } from 'node:zlib';

/**
 * Small, real documents built in memory for the extraction specs, so the
 * tests exercise pdfjs / mammoth / the zip reader on genuine files without
 * committing binaries.
 */

function pdfEscape(s: string): string {
  return s.replace(/[\\()]/g, (c) => `\\${c}`);
}

/** A valid PDF whose pages carry the given text (empty string = image-like page). */
export function buildPdf(pages: string[]): Buffer {
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 font; then (page, content) pairs.
  let next = 4;
  const pageObjects: string[] = [];
  for (const text of pages) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    const lines = text ? text.split('\n') : [];
    const stream = lines.length
      ? `BT /F1 12 Tf 72 720 Td 14 TL ${lines
          .map((l) => `(${pdfEscape(l)}) Tj T*`)
          .join(' ')} ET`
      : // A filled rectangle: what a scanned page looks like to a text parser.
        '0 0 1 rg 72 72 400 600 re f';
    pageObjects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  }
  objects.push(
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>\nendobj\n`,
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    ...pageObjects,
  );

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const o of objects) {
    offsets.push(Buffer.byteLength(body));
    body += o;
  }
  const xrefAt = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets)
    body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/** Minimal zip writer (deflate or store), enough for OOXML containers. */
export function buildZip(
  entries: Array<{
    name: string;
    data: string | Buffer;
    store?: boolean;
    /** Lie about the inflated size in the headers (zip-bomb style). */
    declaredSize?: number;
  }>,
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const data = e.store ? raw : deflateRawSync(raw);
    const method = e.store ? 0 : 8;
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(raw) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(e.declaredSize ?? raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(e.declaredSize ?? raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildDocx(paragraphs: string[]): Buffer {
  return buildZip([
    {
      name: '[Content_Types].xml',
      data:
        '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data:
        '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: 'word/document.xml',
      data:
        '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        paragraphs
          .map(
            (p) =>
              `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(p)}</w:t></w:r></w:p>`,
          )
          .join('') +
        '</w:body></w:document>',
    },
  ]);
}

export function buildPptx(
  slides: Array<{ text: string[]; notes?: string }>,
): Buffer {
  const entries: Array<{ name: string; data: string }> = [];
  slides.forEach((s, i) => {
    entries.push({
      name: `ppt/slides/slide${i + 1}.xml`,
      data:
        '<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>' +
        s.text
          .map(
            (t) =>
              `<p:sp><p:txBody><a:p><a:r><a:t>${xmlEscape(t)}</a:t></a:r></a:p></p:txBody></p:sp>`,
          )
          .join('') +
        '</p:spTree></p:cSld></p:sld>',
    });
    if (s.notes) {
      entries.push({
        name: `ppt/notesSlides/notesSlide${i + 1}.xml`,
        data: `<p:notes xmlns:a="a" xmlns:p="p"><a:p><a:r><a:t>${xmlEscape(s.notes)}</a:t></a:r></a:p></p:notes>`,
      });
    }
  });
  entries.push({
    name: 'ppt/presentation.xml',
    data: '<p:presentation xmlns:p="p"/>',
  });
  return buildZip(entries);
}

export function buildXlsx(
  sheetName: string,
  rows: Array<Array<string | number>>,
): Buffer {
  const strings: string[] = [];
  const idx = (s: string) => {
    const i = strings.indexOf(s);
    if (i >= 0) return i;
    strings.push(s);
    return strings.length - 1;
  };
  const sheetRows = rows
    .map(
      (r, ri) =>
        `<row r="${ri + 1}">` +
        r
          .map((v, ci) => {
            const ref = `${String.fromCharCode(65 + ci)}${ri + 1}`;
            return typeof v === 'number'
              ? `<c r="${ref}"><v>${v}</v></c>`
              : `<c r="${ref}" t="s"><v>${idx(v)}</v></c>`;
          })
          .join('') +
        '</row>',
    )
    .join('');
  return buildZip([
    {
      name: 'xl/workbook.xml',
      data: `<workbook xmlns:r="r"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: `<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`,
    },
    {
      name: 'xl/sharedStrings.xml',
      data: `<sst>${strings.map((s) => `<si><t>${xmlEscape(s)}</t></si>`).join('')}</sst>`,
    },
  ]);
}

/** A real 1×1 PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** A DOCX whose document.xml inflates to `inflatedBytes` (mostly spaces). */
export function buildDocxBomb(
  inflatedBytes: number,
  opts: { declaredSize?: number } = {},
): Buffer {
  const head =
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>';
  const tail = '</w:t></w:r></w:p></w:body></w:document>';
  const body = Buffer.alloc(inflatedBytes - head.length - tail.length, 0x20);
  return buildZip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: 'word/document.xml',
      data: Buffer.concat([Buffer.from(head), body, Buffer.from(tail)]),
      declaredSize: opts.declaredSize,
    },
  ]);
}

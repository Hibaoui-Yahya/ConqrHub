import { ChunkingService } from './chunking.service';

describe('ChunkingService', () => {
  let svc: ChunkingService;

  beforeEach(() => {
    svc = new ChunkingService();
  });

  describe('chunk()', () => {
    it('returns empty array for empty string', () => {
      expect(svc.chunk('')).toEqual([]);
    });

    it('returns empty array for whitespace-only input', () => {
      expect(svc.chunk('   \n  ')).toEqual([]);
    });

    it('returns a single chunk when text fits in one window', () => {
      const text = 'Hello world.';
      const result = svc.chunk(text, { chunkChars: 100, overlap: 10 });
      expect(result).toHaveLength(1);
      expect(result[0].chunkIndex).toBe(0);
      expect(result[0].chunkText).toBe(text);
    });

    it('produces overlapping chunks for a long run without sentence breaks', () => {
      const text = 'A'.repeat(3000);
      const result = svc.chunk(text, { chunkChars: 1000, overlap: 100 });
      expect(result.length).toBeGreaterThanOrEqual(3);
      // Adjacent chunks share overlap content
      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1].chunkText;
        const curr = result[i].chunkText;
        const sharedSuffix = prev.slice(prev.length - 100);
        const sharedPrefix = curr.slice(0, 100);
        expect(sharedSuffix).toBe(sharedPrefix);
      }
    });

    it('assigns chunkIndex sequentially starting at 0', () => {
      const text = 'B'.repeat(5000);
      const chunks = svc.chunk(text, { chunkChars: 1000, overlap: 200 });
      chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
    });

    it('is deterministic — same input produces identical chunks', () => {
      const text = 'C'.repeat(4000);
      const a = svc.chunk(text, { chunkChars: 1600, overlap: 200 });
      const b = svc.chunk(text, { chunkChars: 1600, overlap: 200 });
      expect(a).toEqual(b);
    });

    it('clamps an overlap larger than the chunk so it cannot stall', () => {
      const text = 'D'.repeat(500);
      // overlap > chunkChars — should not hang
      const chunks = svc.chunk(text, { chunkChars: 100, overlap: 150 });
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach((c) =>
        expect(c.chunkText.length).toBeLessThanOrEqual(100),
      );
    });

    it('produces no empty chunks', () => {
      const text = 'E'.repeat(3200);
      const chunks = svc.chunk(text, { chunkChars: 1600, overlap: 200 });
      chunks.forEach((c) => expect(c.chunkText.length).toBeGreaterThan(0));
    });

    it('uses default chunkChars=1200 and overlap=200', () => {
      const text = Array.from(
        { length: 60 },
        (_, i) => `Sentence number ${i} says something useful.`,
      ).join(' ');
      const withDefaults = svc.chunk(text);
      const withExplicit = svc.chunk(text, { chunkChars: 1200, overlap: 200 });
      expect(withDefaults).toEqual(withExplicit);
      withDefaults.forEach((c) =>
        expect(c.chunkText.length).toBeLessThanOrEqual(1200),
      );
    });

    it('handles text shorter than overlap gracefully (single chunk)', () => {
      const text = 'Short text.';
      const chunks = svc.chunk(text, { chunkChars: 200, overlap: 50 });
      expect(chunks).toHaveLength(1);
    });
  });

  describe('chunk() — structure awareness', () => {
    const sentence = (n: number) => `Phrase numéro ${n} du document de test.`;

    it('never cuts a chunk inside a word', () => {
      const words = Array.from({ length: 400 }, (_, i) => `mot${i}`);
      const text = words.join(' ');
      const chunks = svc.chunk(text, { chunkChars: 120, overlap: 30 });
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) {
        for (const w of c.chunkText.split(/\s+/)) {
          expect(words).toContain(w);
        }
      }
    });

    it('ends chunks on sentence boundaries and overlaps by the last sentence(s)', () => {
      const sentences = Array.from({ length: 30 }, (_, i) => sentence(i));
      const text = sentences.join(' ');
      const chunks = svc.chunk(text, { chunkChars: 200, overlap: 60 });

      expect(chunks.length).toBeGreaterThan(2);
      for (const c of chunks) {
        expect(c.chunkText.length).toBeLessThanOrEqual(200);
        expect(c.chunkText).toMatch(/\.$/);
      }
      for (let i = 1; i < chunks.length; i++) {
        const prevLast = /[^.]+\.$/.exec(chunks[i - 1].chunkText)![0].trim();
        // The next chunk starts with the sentence the previous one ended with.
        expect(chunks[i].chunkText.startsWith(prevLast)).toBe(true);
      }
    });

    it('does not carry a sentence longer than the overlap', () => {
      const long = 'L'.repeat(150) + '.';
      const text = `${sentence(1)} ${long} ${sentence(2)} ${sentence(3)} ${sentence(4)} ${sentence(5)}`;
      const chunks = svc.chunk(text, { chunkChars: 200, overlap: 50 });
      // No chunk after the first may begin with the 150-char sentence.
      chunks
        .slice(1)
        .forEach((c) => expect(c.chunkText.startsWith(long)).toBe(false));
    });

    it('splits on blank lines and keeps a paragraph break inside a chunk', () => {
      const text = `${sentence(1)}\n\n${sentence(2)}`;
      const chunks = svc.chunk(text, { chunkChars: 500, overlap: 50 });
      expect(chunks).toHaveLength(1);
      expect(chunks[0].chunkText).toBe(`${sentence(1)}\n\n${sentence(2)}`);
    });

    it('never leaves a heading dangling at the end of a chunk', () => {
      const intro = Array.from({ length: 4 }, (_, i) => sentence(i)).join(' ');
      // The heading alone would still fit in the first chunk (147 + 2 + 18
      // chars); its first sentence would not.
      const text = `${intro}\n# Titre de section\n${sentence(10)} ${sentence(11)}`;
      const chunks = svc.chunk(text, { chunkChars: 170, overlap: 40 });

      expect(chunks).toHaveLength(2);
      expect(chunks[0].chunkText).toBe(intro);
      expect(chunks[1].chunkText).toBe(
        `# Titre de section\n${sentence(10)} ${sentence(11)}`,
      );
    });

    it('treats a short unpunctuated plain-text line as a heading', () => {
      const intro = Array.from({ length: 4 }, (_, i) => sentence(i)).join(' ');
      const text = `${intro}\nCompétences techniques\n${sentence(10)} ${sentence(11)}`;
      const chunks = svc.chunk(text, { chunkChars: 170, overlap: 40 });

      expect(chunks).toHaveLength(2);
      expect(chunks[1].chunkText.startsWith('Compétences techniques\n')).toBe(
        true,
      );
    });

    it('keeps abbreviations such as "M. Dupont" inside one sentence', () => {
      const text =
        'Le candidat M. Dupont a été reçu. Il a signé etc. le contrat.';
      const chunks = svc.chunk(text, { chunkChars: 40, overlap: 0 });
      expect(chunks.some((c) => c.chunkText.endsWith('M.'))).toBe(false);
      expect(chunks.some((c) => c.chunkText.endsWith('etc.'))).toBe(false);
    });

    it('hard-splits a single over-long sentence on whitespace with overlap', () => {
      const words = Array.from({ length: 300 }, (_, i) => `w${i}`);
      const text = words.join(' ') + '.';
      const chunks = svc.chunk(text, { chunkChars: 100, overlap: 20 });
      expect(chunks.length).toBeGreaterThan(5);
      for (const c of chunks) {
        expect(c.chunkText.length).toBeLessThanOrEqual(100);
        for (const w of c.chunkText.replace(/\.$/, '').split(/\s+/)) {
          expect(words).toContain(w);
        }
      }
      // Every word survives somewhere.
      const seen = new Set(
        chunks.flatMap((c) => c.chunkText.replace(/\.$/, '').split(/\s+/)),
      );
      words.forEach((w) => expect(seen.has(w)).toBe(true));
      // Consecutive pieces share their overlap.
      for (let i = 1; i < chunks.length; i++) {
        const firstWord = chunks[i].chunkText.split(/\s+/)[0];
        expect(chunks[i - 1].chunkText).toContain(firstWord);
      }
    });

    it('normalises CRLF line endings', () => {
      const a = svc.chunk(`${sentence(1)}\r\n\r\n${sentence(2)}`);
      const b = svc.chunk(`${sentence(1)}\n\n${sentence(2)}`);
      expect(a).toEqual(b);
    });

    it('is deterministic on realistic prose', () => {
      const text = Array.from({ length: 40 }, (_, i) =>
        i % 7 === 0 ? `\n\n## Section ${i}\n` : sentence(i),
      ).join(' ');
      expect(svc.chunk(text)).toEqual(svc.chunk(text));
    });
  });

  describe('contentHash()', () => {
    it('returns a 64-char hex string', () => {
      const hash = svc.contentHash('hello');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is stable across calls', () => {
      const h1 = svc.contentHash('same input');
      const h2 = svc.contentHash('same input');
      expect(h1).toBe(h2);
    });

    it('differs for different inputs', () => {
      expect(svc.contentHash('a')).not.toBe(svc.contentHash('b'));
    });

    it('is sensitive to whitespace', () => {
      expect(svc.contentHash('hello')).not.toBe(svc.contentHash('hello '));
    });
  });
});

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

    it('produces overlapping chunks for long text', () => {
      const text = 'A'.repeat(3000);
      const result = svc.chunk(text, { chunkChars: 1000, overlap: 100 });
      // stride = 900; chunks at 0, 900, 1800, 2700 → 4 chunks
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

    it('caps overlap to chunkChars - 1 to prevent infinite loop', () => {
      const text = 'D'.repeat(500);
      // overlap > chunkChars — should not hang
      const chunks = svc.chunk(text, { chunkChars: 100, overlap: 150 });
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('produces no empty chunks', () => {
      const text = 'E'.repeat(3200);
      const chunks = svc.chunk(text, { chunkChars: 1600, overlap: 200 });
      chunks.forEach((c) => expect(c.chunkText.length).toBeGreaterThan(0));
    });

    it('uses default chunkChars=1600 and overlap=200', () => {
      const text = 'F'.repeat(3000);
      const withDefaults = svc.chunk(text);
      const withExplicit = svc.chunk(text, { chunkChars: 1600, overlap: 200 });
      expect(withDefaults).toEqual(withExplicit);
    });

    it('handles text shorter than overlap gracefully (single chunk)', () => {
      const text = 'Short text.';
      const chunks = svc.chunk(text, { chunkChars: 200, overlap: 50 });
      expect(chunks).toHaveLength(1);
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

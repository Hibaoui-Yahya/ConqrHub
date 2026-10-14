import { RagRetrievalService } from './rag-retrieval.service';

const svc = new RagRetrievalService({} as any, {} as any, {} as any);

const pageMeta = {
  pageId: 'p1',
  title: 'Achats',
  spaceId: 's1',
  workspaceId: 'w1',
};
const attMeta = {
  ...pageMeta,
  attachmentId: 'att-1',
  fileName: 'Contrat 2026.pdf',
};

const candidate = (chunkIndex: number, metadata: any, chunkText: string) => ({
  sourceKind: 'page' as const,
  sourceId: 'p1',
  chunkIndex,
  chunkText,
  metadata,
  rrf: 1 / (60 + chunkIndex),
  vectorScore: 0.8,
  matchedBy: ['vector' as const],
});

describe('RagRetrievalService — passages from attached documents', () => {
  it('keeps the page text and an attached document in separate, cited passages', () => {
    const passages = svc.mergeAdjacent([
      candidate(0, pageMeta, 'Toute dépense passe par Marc.'),
      candidate(
        1,
        attMeta,
        '[Attachment: Contrat 2026.pdf]\nPlafond annuel : 120 000 $.',
      ),
      candidate(2, attMeta, 'Renouvellement tacite.'),
    ]);

    expect(passages).toHaveLength(2);
    const page = passages.find((p) => !p.attachmentId)!;
    const doc = passages.find((p) => p.attachmentId)!;
    expect(page.chunkText).toBe('Toute dépense passe par Marc.');
    expect(doc).toMatchObject({
      sourceId: 'p1',
      title: 'Achats',
      attachmentId: 'att-1',
      fileName: 'Contrat 2026.pdf',
    });
    expect(doc.chunkText).toContain('Plafond annuel');
    expect(doc.chunkText).toContain('Renouvellement tacite.');
  });

  it('labels document passages in the model context and on the returned chunks', () => {
    const ctx = svc.assembleContext([
      {
        sourceKind: 'page',
        sourceId: 'p1',
        chunkIndex: 1,
        chunkText: 'Plafond annuel : 120 000 $.',
        metadata: attMeta,
        score: 0.9,
      },
      {
        sourceKind: 'page',
        sourceId: 'p1',
        chunkIndex: 0,
        chunkText: 'Toute dépense passe par Marc.',
        metadata: pageMeta,
        score: 0.8,
      },
    ]);

    expect(ctx.contextText).toContain(
      '[P1] Achats — attached document "Contrat 2026.pdf"',
    );
    expect(ctx.contextText).toContain('[P2] Achats\n');
    expect(ctx.chunks[0]).toMatchObject({
      attachmentId: 'att-1',
      fileName: 'Contrat 2026.pdf',
    });
    expect(ctx.chunks[1].attachmentId).toBeUndefined();
    expect('fileName' in ctx.chunks[1]).toBe(false);
  });
});

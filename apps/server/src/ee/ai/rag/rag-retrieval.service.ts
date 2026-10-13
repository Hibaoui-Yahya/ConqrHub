import { Injectable, Logger, Optional } from '@nestjs/common';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { AiProviderService } from '../providers/ai-provider.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  EmbeddingRepository,
  SimilarityResult,
} from '../embeddings/embedding.repository';

export interface ContextChunk {
  kind: 'expert_insight' | 'page';
  sourceId: string;
  chunkText: string;
  title: string | null;
  /** Cosine similarity (0–1) for display; estimated for lexical-only hits. */
  score: number;
  label: string;
  /**
   * First chunk index of the passage. Optional in the type so hand-built
   * contexts in older specs still compile; the service always sets it.
   */
  chunkIndex?: number;
  /** First 240 characters of the passage on a single line. */
  excerpt?: string;
  /** Which retrieval paths surfaced this passage. */
  matchedBy?: Array<'vector' | 'lexical'>;
}

export interface RetrievedContext {
  chunks: ContextChunk[];
  contextText: string;
  isEmpty: boolean;
}

/** A chunk after Reciprocal Rank Fusion, before passage assembly. */
export interface FusedCandidate {
  sourceKind: SimilarityResult['sourceKind'];
  sourceId: string;
  chunkIndex: number;
  chunkText: string;
  metadata: Record<string, unknown> | null;
  /** RRF score, the ordering key. */
  rrf: number;
  /** Cosine score when the vector path returned this chunk. */
  vectorScore: number | null;
  matchedBy: Array<'vector' | 'lexical'>;
}

const MAX_CONTEXT_CHARS = 9_000;
const DEFAULT_TOP_K = 10;
const EXCERPT_CHARS = 240;
const RRF_K = 60;
const MAX_CHUNKS_PER_SOURCE = 3;
/** Display score for a lexical-only passage whose page has no vector sibling. */
const FALLBACK_LEXICAL_SCORE = 0.5;

// Postgres SQLSTATE for "column does not exist": the lexical migration has not
// run on this database yet. Logged once, then retrieval stays vector-only.
const PG_UNDEFINED_COLUMN = '42703';

type PassageInput = {
  kind: ContextChunk['kind'];
  sourceId: string;
  chunkIndex: number;
  chunkText: string;
  title: string | null;
  score: number;
  matchedBy?: Array<'vector' | 'lexical'>;
};

@Injectable()
export class RagRetrievalService {
  private readonly logger = new Logger(RagRetrievalService.name);
  private lexicalUnavailableLogged = false;

  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly repo: EmbeddingRepository,
    private readonly env: EnvironmentService,
    @Optional() private readonly pagePermissions?: PagePermissionRepo,
  ) {}

  /**
   * Hybrid retrieval: vector (cosine) and lexical (tsvector) searches run in
   * parallel over the same permission scope, are fused with Reciprocal Rank
   * Fusion, capped per source, and adjacent chunks of one page are merged
   * into a single passage before the context budget is applied.
   */
  async retrieve(opts: {
    question: string;
    workspaceId: string;
    spaceId?: string;
    spaceIds?: string[];
    pageId?: string;
    topK?: number;
    /**
     * The reader. When set, page passages are filtered through page-level
     * permissions, so a restricted page inside a readable space never
     * reaches the model. Every user-facing caller must pass it.
     */
    userId?: string;
  }): Promise<RetrievedContext> {
    const { question, workspaceId, spaceId, spaceIds, pageId, userId } = opts;
    const topK = opts.topK ?? DEFAULT_TOP_K;

    // A caller passing an empty allow-list can read no spaces — skip the
    // embedding call entirely and return empty context.
    if (spaceIds && spaceIds.length === 0) {
      return { chunks: [], contextText: '', isEmpty: true };
    }

    const fetchK = topK * 2;
    const scope = { workspaceId, spaceId, spaceIds, sourceId: pageId };

    const [vector, lexical] = await Promise.all([
      this.aiProvider
        .embed(question)
        .then((queryEmbedding) =>
          this.repo.similaritySearch({
            ...scope,
            queryEmbedding,
            topK: fetchK,
          }),
        ),
      this.lexicalSearchSafe({ ...scope, query: question, topK: fetchK }),
    ]);

    const allowed = userId
      ? await this.accessiblePageIds([...vector, ...lexical], userId, spaceId)
      : null;
    const keep = (r: SimilarityResult) =>
      !allowed || r.sourceKind !== 'page' || allowed.has(r.sourceId);

    return this.assembleFused(vector.filter(keep), lexical.filter(keep), {
      topK,
      minScore: this.env.getAiRagMinScore(),
    });
  }

  /**
   * Page ids among the results that the user may open. Fails closed: if the
   * permission check cannot run, no page passage is returned.
   */
  private async accessiblePageIds(
    results: SimilarityResult[],
    userId: string,
    spaceId?: string,
  ): Promise<Set<string>> {
    const pageIds = [
      ...new Set(
        results.filter((r) => r.sourceKind === 'page').map((r) => r.sourceId),
      ),
    ];
    if (pageIds.length === 0) return new Set();
    if (!this.pagePermissions) {
      this.logger.error('Page permission check unavailable: page passages dropped');
      return new Set();
    }
    try {
      const ids = await this.pagePermissions.filterAccessiblePageIds({
        pageIds,
        userId,
        spaceId,
      });
      return new Set(ids);
    } catch (err) {
      this.logger.error(
        `Page permission check failed, page passages dropped: ${err instanceof Error ? err.message : String(err)}`,
      );
      return new Set();
    }
  }

  /**
   * Lexical search is an enhancement: any failure (most likely the `tsv`
   * column missing because the migration has not run) degrades retrieval to
   * vector-only instead of failing the request.
   */
  private async lexicalSearchSafe(
    opts: Parameters<EmbeddingRepository['lexicalSearch']>[0],
  ): Promise<SimilarityResult[]> {
    try {
      return await this.repo.lexicalSearch(opts);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : String(err);
      if (code === PG_UNDEFINED_COLUMN) {
        if (!this.lexicalUnavailableLogged) {
          this.lexicalUnavailableLogged = true;
          this.logger.warn(
            `Lexical search unavailable (${message}); run migration 20261013T120000-ai-embeddings-lexical. Retrieval is vector-only until then.`,
          );
        }
      } else {
        this.logger.warn(
          `Lexical search failed, using vector-only: ${message}`,
        );
      }
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Fusion
  // ---------------------------------------------------------------------------

  /**
   * Fuse the two ranked lists (RRF, k=60), apply the relevance floor to
   * vector-only candidates, cap chunks per source, keep the top `topK`, merge
   * adjacent chunks of the same source, and render the context.
   */
  assembleFused(
    vector: SimilarityResult[],
    lexical: SimilarityResult[],
    opts: { topK?: number; minScore?: number } = {},
  ): RetrievedContext {
    const topK = opts.topK ?? DEFAULT_TOP_K;
    const minScore = opts.minScore ?? 0;

    const fused = this.fuse(vector, lexical);

    // Relevance floor: a chunk only the vector path found must actually
    // resemble the question. A lexical hit is an exact-term match and is kept
    // regardless of its cosine score. Disabled when min score is 0.
    const floored =
      minScore > 0
        ? fused.filter(
            (c) =>
              c.matchedBy.includes('lexical') ||
              (c.vectorScore ?? 0) >= minScore,
          )
        : fused;

    // Cap chunks per source so one long page cannot fill the whole context.
    const perSource = new Map<string, number>();
    const capped: FusedCandidate[] = [];
    for (const c of floored) {
      const key = `${c.sourceKind}:${c.sourceId}`;
      const n = perSource.get(key) ?? 0;
      if (n >= MAX_CHUNKS_PER_SOURCE) continue;
      perSource.set(key, n + 1);
      capped.push(c);
      if (capped.length >= topK) break;
    }

    const passages = this.mergeAdjacent(capped);
    return this.packContext(passages);
  }

  /** Reciprocal Rank Fusion of the vector and lexical lists, best first. */
  fuse(
    vector: SimilarityResult[],
    lexical: SimilarityResult[],
  ): FusedCandidate[] {
    const byKey = new Map<string, FusedCandidate>();
    const keyOf = (r: SimilarityResult) =>
      `${r.sourceKind}:${r.sourceId}:${r.chunkIndex}`;

    const add = (list: SimilarityResult[], path: 'vector' | 'lexical') => {
      list.forEach((r, rank) => {
        const key = keyOf(r);
        const contribution = 1 / (RRF_K + rank + 1);
        const existing = byKey.get(key);
        if (existing) {
          existing.rrf += contribution;
          if (!existing.matchedBy.includes(path)) existing.matchedBy.push(path);
          if (path === 'vector') existing.vectorScore = r.score;
          return;
        }
        byKey.set(key, {
          sourceKind: r.sourceKind,
          sourceId: r.sourceId,
          chunkIndex: r.chunkIndex,
          chunkText: r.chunkText,
          metadata: r.metadata,
          rrf: contribution,
          vectorScore: path === 'vector' ? r.score : null,
          matchedBy: [path],
        });
      });
    };

    add(vector, 'vector');
    add(lexical, 'lexical');

    return [...byKey.values()].sort(
      (a, b) =>
        b.rrf - a.rrf ||
        a.sourceId.localeCompare(b.sourceId) ||
        a.chunkIndex - b.chunkIndex,
    );
  }

  /**
   * Chunks of the same source with consecutive indices become one passage,
   * with the overlap between them (the chunker repeats the last sentences of
   * a chunk at the start of the next) removed. Passage order follows the best
   * RRF score of its members; the display score is the best cosine score of
   * the source's vector hits, or a neutral fallback.
   */
  mergeAdjacent(candidates: FusedCandidate[]): PassageInput[] {
    const bySource = new Map<string, FusedCandidate[]>();
    for (const c of candidates) {
      const key = `${c.sourceKind}:${c.sourceId}`;
      const list = bySource.get(key);
      if (list) list.push(c);
      else bySource.set(key, [c]);
    }

    const passages: Array<PassageInput & { rrf: number }> = [];

    for (const list of bySource.values()) {
      const sourceBestVector = list.reduce<number | null>(
        (best, c) =>
          c.vectorScore == null ? best : Math.max(best ?? -1, c.vectorScore),
        null,
      );
      const ordered = [...list].sort((a, b) => a.chunkIndex - b.chunkIndex);

      let run: FusedCandidate[] = [];
      const flush = () => {
        if (run.length === 0) return;
        const text = run.reduce(
          (acc, c, i) =>
            i === 0 ? c.chunkText : joinDedupingOverlap(acc, c.chunkText),
          '',
        );
        const runBestVector = run.reduce<number | null>(
          (best, c) =>
            c.vectorScore == null ? best : Math.max(best ?? -1, c.vectorScore),
          null,
        );
        const matchedBy = [
          ...new Set(run.flatMap((c) => c.matchedBy)),
        ] as Array<'vector' | 'lexical'>;
        const first = run[0];
        passages.push({
          kind: first.sourceKind as ContextChunk['kind'],
          sourceId: first.sourceId,
          chunkIndex: first.chunkIndex,
          chunkText: text,
          title: this.extractTitle(first.metadata),
          score: runBestVector ?? sourceBestVector ?? FALLBACK_LEXICAL_SCORE,
          matchedBy,
          rrf: Math.max(...run.map((c) => c.rrf)),
        });
        run = [];
      };

      for (const c of ordered) {
        const prev = run[run.length - 1];
        if (prev && c.chunkIndex !== prev.chunkIndex + 1) flush();
        run.push(c);
      }
      flush();
    }

    return passages
      .sort((a, b) => b.rrf - a.rrf || a.sourceId.localeCompare(b.sourceId))
      .map(({ rrf: _rrf, ...p }) => p);
  }

  // ---------------------------------------------------------------------------
  // Context assembly
  // ---------------------------------------------------------------------------

  /**
   * Legacy single-list assembly: results in the given order, no fusion, no
   * merging. Kept for callers (and tests) that already hold a ranked list.
   */
  assembleContext(raw: SimilarityResult[]): RetrievedContext {
    return this.packContext(
      raw.map((r) => ({
        kind: r.sourceKind as ContextChunk['kind'],
        sourceId: r.sourceId,
        chunkIndex: r.chunkIndex,
        chunkText: r.chunkText,
        title: this.extractTitle(r.metadata),
        score: r.score,
        matchedBy: ['vector'],
      })),
    );
  }

  private packContext(items: PassageInput[]): RetrievedContext {
    const insights = items.filter((r) => r.kind === 'expert_insight');
    const pages = items.filter((r) => r.kind === 'page');

    const chunks: ContextChunk[] = [];
    let remaining = MAX_CONTEXT_CHARS;

    const push = (r: PassageInput, label: string): boolean => {
      if (remaining <= 0) return false;
      const text = r.chunkText.slice(0, remaining);
      remaining -= text.length;
      chunks.push({
        kind: r.kind,
        sourceId: r.sourceId,
        chunkText: text,
        title: r.title,
        score: r.score,
        label,
        chunkIndex: r.chunkIndex,
        excerpt: makeExcerpt(text),
        matchedBy: r.matchedBy ?? ['vector'],
      });
      return true;
    };

    let insightIdx = 1;
    for (const r of insights) {
      if (!push(r, `E${insightIdx}`)) break;
      insightIdx++;
    }

    let pageIdx = 1;
    for (const r of pages) {
      if (!push(r, `P${pageIdx}`)) break;
      pageIdx++;
    }

    const contextText = this.renderContextText(chunks);
    return { chunks, contextText, isEmpty: chunks.length === 0 };
  }

  private renderContextText(chunks: ContextChunk[]): string {
    if (chunks.length === 0) return '';

    const expertChunks = chunks.filter((c) => c.kind === 'expert_insight');
    const pageChunks = chunks.filter((c) => c.kind === 'page');

    const parts: string[] = [];

    if (expertChunks.length > 0) {
      parts.push('[Expert Insights]');
      for (const c of expertChunks) {
        const heading = c.title ? `[${c.label}] ${c.title}` : `[${c.label}]`;
        parts.push(`${heading}\n${c.chunkText}`);
      }
    }

    if (pageChunks.length > 0) {
      parts.push('[Pages]');
      for (const c of pageChunks) {
        const heading = c.title ? `[${c.label}] ${c.title}` : `[${c.label}]`;
        parts.push(`${heading}\n${c.chunkText}`);
      }
    }

    return parts.join('\n\n');
  }

  private extractTitle(
    metadata: Record<string, unknown> | null,
  ): string | null {
    return (metadata?.title as string | undefined) ?? null;
  }
}

/** First `EXCERPT_CHARS` characters of a passage, whitespace collapsed. */
export function makeExcerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_CHARS
    ? `${flat.slice(0, EXCERPT_CHARS - 1).trimEnd()}…`
    : flat;
}

/**
 * Append `next` to `acc`, dropping the longest suffix of `acc` that `next`
 * starts with (the chunker's sentence overlap). Falls back to a plain join
 * when the two share nothing.
 */
export function joinDedupingOverlap(acc: string, next: string): string {
  const max = Math.min(acc.length, next.length);
  // Only accept an overlap that ends on a word boundary of `next` (the
  // chunker's carried sentences are followed by a separator), so a few
  // coincidentally shared letters never swallow part of a word.
  for (let len = max; len >= 8; len--) {
    const endsOnBoundary = len === next.length || /\s/.test(next[len]);
    if (endsOnBoundary && acc.endsWith(next.slice(0, len))) {
      const rest = next.slice(len).trimStart();
      return rest ? `${acc}\n${rest}` : acc;
    }
  }
  return `${acc}\n${next}`;
}

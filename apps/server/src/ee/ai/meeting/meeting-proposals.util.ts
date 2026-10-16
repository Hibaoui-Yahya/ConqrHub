/**
 * Quality of the action proposals extracted from a meeting: which
 * transcript segments a proposal's quote comes from, which ConqrPlan
 * project the meeting's space maps to, and whether a work item with the
 * same intent already exists. Pure; unit-tested in
 * meeting-proposals.util.spec.ts.
 */

/** Lowercase, no accents, no punctuation, single spaces. */
export function normalizeText(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function words(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((w) => w.length > 1);
}

/** Share of the quote's words a segment contains (0–1). */
function coverage(quoteWords: string[], segmentWords: Set<string>): number {
  if (quoteWords.length === 0) return 0;
  let hit = 0;
  for (const w of quoteWords) if (segmentWords.has(w)) hit += 1;
  return hit / quoteWords.length;
}

export type EvidenceSegment = { id: string; text: string; rawText?: string | null };

/**
 * The transcript segments a quote was taken from, in transcript order. A
 * quote may span several segments and the model may trim or re-punctuate
 * it: each sentence of the quote is matched on its own — verbatim (after
 * normalisation) first, else by the segment holding most of its words
 * (at least 60 %). Nothing matches → []: never a guessed citation.
 */
export function matchEvidenceSegments(
  quote: string,
  segments: EvidenceSegment[],
  max = 6,
): string[] {
  const normalizedQuote = normalizeText(quote);
  if (!normalizedQuote || !Array.isArray(segments) || segments.length === 0) return [];
  const prepared = segments
    .filter((s) => s && s.id)
    .map((s, index) => {
      const text = normalizeText(`${s.text ?? ''}`);
      const raw = normalizeText(`${s.rawText ?? ''}`);
      return { id: String(s.id), index, text, raw, words: new Set([...words(text), ...words(raw)]) };
    });
  const found = new Set<number>();
  // The whole quote inside one segment, or whole segments inside the quote.
  for (const seg of prepared) {
    if (!seg.text) continue;
    if (seg.text.includes(normalizedQuote) || (seg.raw && seg.raw.includes(normalizedQuote))) {
      found.add(seg.index);
    } else if (seg.text.split(' ').length >= 3 && normalizedQuote.includes(seg.text)) {
      found.add(seg.index);
    }
  }
  if (found.size === 0) {
    const sentences = String(quote)
      .split(/(?<=[.!?…])\s+|\n+/)
      .map((s) => words(s))
      .filter((w) => w.length >= 3);
    for (const sentence of sentences.length ? sentences : [words(quote)]) {
      let best: { index: number; score: number } | null = null;
      for (const seg of prepared) {
        const score = coverage(sentence, seg.words);
        if (!best || score > best.score) best = { index: seg.index, score };
      }
      if (best && best.score >= 0.6) found.add(best.index);
    }
  }
  return [...found]
    .sort((a, b) => a - b)
    .slice(0, max)
    .map((i) => prepared.find((p) => p.index === i)!.id);
}

/** Dice coefficient of the two titles' word sets (0–1). */
export function titleSimilarity(a: string, b: string): number {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common += 1;
  return (2 * common) / (wa.size + wb.size);
}

/** At or above: shown as a possible duplicate. */
export const DUPLICATE_CANDIDATE_SIMILARITY = 0.5;
/** At or above: likely the same work, never approved in bulk. */
export const LIKELY_DUPLICATE_SIMILARITY = 0.8;

export type DuplicateCandidate = {
  id: string;
  name: string;
  projectId: string | null;
  identifier: string | null;
  sequenceId: number | null;
  state: string | null;
  stateGroup: string | null;
  similarity: number;
};

/** Work-item search hits ranked against a proposal title. */
export function rankDuplicateCandidates(
  title: string,
  hits: Array<{
    id: string;
    name: string;
    project_id?: string;
    project__identifier?: string | null;
    sequence_id?: number | null;
    state__name?: string | null;
    state__group?: string | null;
  }>,
  limit = 3,
): DuplicateCandidate[] {
  return (hits ?? [])
    .filter((h) => h && h.id && h.name)
    .map((h) => ({
      id: String(h.id),
      name: String(h.name),
      projectId: h.project_id ?? null,
      identifier: h.project__identifier ?? null,
      sequenceId: typeof h.sequence_id === 'number' ? h.sequence_id : null,
      state: h.state__name ?? null,
      stateGroup: h.state__group ?? null,
      similarity: Math.round(titleSimilarity(title, h.name) * 100) / 100,
    }))
    .filter((c) => c.similarity >= DUPLICATE_CANDIDATE_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Words of a title worth searching for (the search matches names). */
export function duplicateSearchQuery(title: string): string {
  const stop = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'au', 'aux', 'pour', 'avec', 'sur',
    'the', 'a', 'an', 'to', 'of', 'for', 'and', 'or', 'with', 'on', 'in',
  ]);
  const kept = String(title ?? '')
    .split(/\s+/)
    .filter((w) => w && !stop.has(normalizeText(w)));
  return (kept.length ? kept : String(title ?? '').split(/\s+/)).slice(0, 6).join(' ').slice(0, 120);
}

/**
 * The ConqrPlan project of a meeting from the project↔space mappings of its
 * spaces: the one project mapped as primary documentation space, else the
 * one project mapped at all. Several → ambiguous (the reviewer chooses).
 */
export function resolveMappedProject(
  mappings: Array<{ planeProjectId: string; mappingKind?: string | null }>,
): { projectId: string | null; candidates: string[] } {
  const all = [...new Set((mappings ?? []).map((m) => m.planeProjectId).filter(Boolean))];
  const primary = [
    ...new Set(
      (mappings ?? [])
        .filter((m) => (m.mappingKind ?? 'primary') === 'primary')
        .map((m) => m.planeProjectId)
        .filter(Boolean),
    ),
  ];
  if (primary.length === 1) return { projectId: primary[0], candidates: all };
  if (primary.length === 0 && all.length === 1) return { projectId: all[0], candidates: all };
  return { projectId: null, candidates: all };
}

/**
 * Saved AI insights of a meeting (table meeting_insights): the "AI
 * communication analysis" of the speakers and the "Ask about this meeting"
 * questions with their answers. Pure; unit-tested in
 * meeting-insights.util.spec.ts.
 */

export const INSIGHT_KINDS = ['communication-analysis', 'qa'] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];

export const MAX_INSIGHT_CONTENT_CHARS = 50_000;
export const MAX_INSIGHT_QUESTION_CHARS = 2_000;
/** Saved insights per meeting. */
export const MAX_INSIGHTS_PER_MEETING = 200;

export function isInsightKind(value: unknown): value is InsightKind {
  return typeof value === 'string' && (INSIGHT_KINDS as readonly string[]).includes(value);
}

/**
 * The insight to store, or a French reason why not. Text is trimmed; a
 * question belongs to "qa" only and is required there.
 */
export function normalizeInsight(input: {
  kind?: unknown;
  question?: unknown;
  content?: unknown;
  transcriptVersion?: unknown;
}):
  | { ok: true; kind: InsightKind; question: string | null; content: string; transcriptVersion: number | null }
  | { ok: false; error: string } {
  if (!isInsightKind(input.kind)) {
    return { ok: false, error: 'Type d’élément inconnu : « communication-analysis » ou « qa » attendu.' };
  }
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!content) return { ok: false, error: 'Le contenu à enregistrer est vide.' };
  if (content.length > MAX_INSIGHT_CONTENT_CHARS) {
    return { ok: false, error: `Le contenu dépasse ${MAX_INSIGHT_CONTENT_CHARS} caractères.` };
  }
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  if (input.kind === 'qa' && !question) {
    return { ok: false, error: 'La question est obligatoire pour enregistrer une réponse.' };
  }
  if (question.length > MAX_INSIGHT_QUESTION_CHARS) {
    return { ok: false, error: `La question dépasse ${MAX_INSIGHT_QUESTION_CHARS} caractères.` };
  }
  const version = Number(input.transcriptVersion);
  return {
    ok: true,
    kind: input.kind,
    question: input.kind === 'qa' ? question : null,
    content,
    transcriptVersion: Number.isSafeInteger(version) && version > 0 ? version : null,
  };
}

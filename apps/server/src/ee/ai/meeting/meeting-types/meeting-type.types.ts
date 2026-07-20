import { z } from 'zod';

/** Evidence anchoring an extracted item to transcript segments (D9/D11). */
export const evidenceSchema = z.object({
  segmentIds: z.array(z.string()).min(1),
  quote: z.string().min(1),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const actionItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  owner: z.string().nullable().default(null),
  dueDate: z.string().nullable().default(null),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  commitment: z
    .enum(['explicit', 'suggested', 'implied', 'unassigned'])
    .default('suggested'),
  confidence: z.number().min(0).max(1).default(0.5),
  evidence: z.array(evidenceSchema).min(1),
});
export type ActionItem = z.infer<typeof actionItemSchema>;

export const decisionSchema = z.object({
  title: z.string().min(1),
  detail: z.string().default(''),
  kind: z
    .enum(['final', 'provisional', 'recommendation', 'option', 'rejected'])
    .default('provisional'),
  confidence: z.number().min(0).max(1).default(0.5),
  evidence: z.array(evidenceSchema).min(1),
});
export type Decision = z.infer<typeof decisionSchema>;

export const riskSchema = z.object({
  title: z.string().min(1),
  detail: z.string().default(''),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
  evidence: z.array(evidenceSchema).min(1),
});

export const openQuestionSchema = z.object({
  question: z.string().min(1),
  raisedBy: z.string().nullable().default(null),
  evidence: z.array(evidenceSchema).min(1),
});

/** Base extraction shared by every meeting type. */
export const baseExtractionSchema = z.object({
  summary: z.string().min(1),
  topics: z.array(z.string()).default([]),
  keyPoints: z.array(z.string()).default([]),
  participants: z.array(z.string()).default([]),
  decisions: z.array(decisionSchema).default([]),
  actionItems: z.array(actionItemSchema).default([]),
  openQuestions: z.array(openQuestionSchema).default([]),
  risks: z.array(riskSchema).default([]),
  followUps: z.array(z.string()).default([]),
});
export type BaseExtraction = z.infer<typeof baseExtractionSchema>;

export type MeetingSensitivity = 's0' | 's1' | 's2' | 's3';

export type ProposalRiskLevel = 'safe' | 'normal' | 'risky';

export interface ProposalSeed {
  kind: string;
  targetApp: 'conqrhub' | 'conqrplane' | 'conqrcrm' | 'conqrtoptalent';
  title: string;
  payload: Record<string, unknown>;
  reason: string;
  evidence: Evidence[];
  confidence: number;
  commitment: 'explicit' | 'suggested' | 'implied' | 'unassigned';
  riskLevel: ProposalRiskLevel;
}

export interface RenderContext {
  meetingTitle: string;
  meetingDate: string;
  meetingType: string;
  speakers: string[];
}

export interface MeetingTypeDefinition<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  id: string;
  name: string;
  /** Template version recorded on generated documents. */
  version: number;
  sensitivity: MeetingSensitivity;
  /** Rule-based detection signals (lowercase substrings). */
  detectionKeywords: string[];
  extractionSchema: TSchema;
  /** Type-specific extraction guidance appended to the base prompt. */
  extractionInstructions: string;
  renderDocument(
    structured: z.infer<TSchema>,
    ctx: RenderContext,
  ): { title: string; markdown: string };
  buildProposals(structured: z.infer<TSchema>, ctx: RenderContext): ProposalSeed[];
}

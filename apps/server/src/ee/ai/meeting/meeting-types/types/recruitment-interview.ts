import { z } from 'zod';
import {
  baseExtractionSchema,
  evidenceSchema,
  MeetingTypeDefinition,
} from '../meeting-type.types';
import { mdList, mdSection, renderBaseSections } from '../render.helpers';

const competencySchema = z.object({
  competency: z.string().min(1),
  /** Factual observation, quoted or tightly paraphrased from the candidate. */
  evidenceSummary: z.string().min(1),
  /** Interviewer/AI interpretation — kept separate from evidence. */
  interpretation: z.string().default(''),
  rating: z.enum(['strong', 'adequate', 'weak', 'not-assessed']).default('not-assessed'),
  evidence: z.array(evidenceSchema).min(1),
});

const recruitmentInterviewSchema = baseExtractionSchema.extend({
  candidate: z.string().nullable().default(null),
  jobOpening: z.string().nullable().default(null),
  interviewType: z.string().default('general'),
  questionsAndAnswers: z
    .array(
      z.object({
        question: z.string(),
        answerSummary: z.string(),
        evidence: z.array(evidenceSchema).min(1),
      }),
    )
    .default([]),
  competencies: z.array(competencySchema).default([]),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  motivation: z.string().default(''),
  availability: z.string().default(''),
  compensationDiscussed: z.string().default(''),
  recommendation: z
    .enum(['advance', 'hold', 'do-not-advance', 'no-recommendation'])
    .default('no-recommendation'),
  followUpQuestions: z.array(z.string()).default([]),
});

export const recruitmentInterview: MeetingTypeDefinition<
  typeof recruitmentInterviewSchema
> = {
  id: 'recruitment-interview',
  name: 'Recruitment interview',
  version: 1,
  sensitivity: 's3',
  detectionKeywords: [
    'interview',
    'candidate',
    'your experience with',
    'notice period',
    'why do you want to join',
    'walk me through your resume',
    'hiring',
  ],
  extractionSchema: recruitmentInterviewSchema,
  extractionInstructions:
    'Separate factual candidate statements (evidenceSummary, quoted or tightly ' +
    'paraphrased) from interviewer interpretation. Every competency rating MUST cite ' +
    'transcript evidence. Record compensation details only if explicitly discussed. ' +
    'NEVER record or infer protected characteristics (age, ethnicity, religion, ' +
    'family status, health, etc.) — omit any such content entirely. The ' +
    'recommendation is advisory input for humans, never a hiring decision.',
  renderDocument(structured, ctx) {
    const qa = structured.questionsAndAnswers
      .map((q) => `- **Q:** ${q.question}\n  **A:** ${q.answerSummary}`)
      .join('\n');
    const comps = structured.competencies
      .map(
        (c) =>
          `- **${c.competency}** — ${c.rating}\n  - Evidence: ${c.evidenceSummary}` +
          (c.interpretation ? `\n  - Interpretation: ${c.interpretation}` : ''),
      )
      .join('\n');
    const markdown = [
      renderBaseSections(structured, ctx),
      mdSection('Candidate', structured.candidate ?? ''),
      mdSection('Job opening', structured.jobOpening ?? ''),
      mdSection('Interview type', structured.interviewType),
      mdSection('Questions & answers', qa),
      mdSection('Competency scorecard (advisory)', comps),
      mdSection('Strengths', mdList(structured.strengths)),
      mdSection('Concerns', mdList(structured.concerns)),
      mdSection('Motivation', structured.motivation),
      mdSection('Availability', structured.availability),
      mdSection('Compensation (as discussed)', structured.compensationDiscussed),
      mdSection('Recommendation (advisory, human decision required)', structured.recommendation),
      mdSection('Follow-up questions', mdList(structured.followUpQuestions)),
    ]
      .filter(Boolean)
      .join('\n');
    return {
      title: `Interview — ${structured.candidate ?? ctx.meetingTitle}`,
      markdown,
    };
  },
  buildProposals(structured) {
    if (!structured.candidate) return [];
    // TopTalent seam (D13): recorded but not executable until the app exists.
    return [
      {
        kind: 'toptalent_save_interview',
        targetApp: 'conqrtoptalent',
        title: `Save interview record for ${structured.candidate}`,
        payload: {
          candidate: structured.candidate,
          jobOpening: structured.jobOpening,
          interviewType: structured.interviewType,
          recommendation: structured.recommendation,
        },
        reason: 'Interview evidence and scorecard should live on the candidate record',
        evidence: structured.competencies[0]?.evidence ?? [
          { segmentIds: ['s0000'], quote: structured.summary.slice(0, 120) },
        ],
        confidence: 0.6,
        commitment: 'suggested',
        riskLevel: 'risky',
      },
    ];
  },
};

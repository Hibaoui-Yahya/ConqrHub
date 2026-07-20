import { z } from 'zod';
import {
  baseExtractionSchema,
  evidenceSchema,
  MeetingTypeDefinition,
} from '../meeting-type.types';
import {
  mdList,
  mdSection,
  renderBaseSections,
  workItemProposalsFromActions,
} from '../render.helpers';

const salesDiscoverySchema = baseExtractionSchema.extend({
  customer: z.string().nullable().default(null),
  contacts: z.array(z.string()).default([]),
  businessProblem: z.string().default(''),
  painPoints: z
    .array(z.object({ point: z.string(), evidence: z.array(evidenceSchema).min(1) }))
    .default([]),
  desiredOutcomes: z.array(z.string()).default([]),
  budgetSignals: z.array(z.string()).default([]),
  decisionCriteria: z.array(z.string()).default([]),
  decisionProcess: z.string().default(''),
  timeline: z.string().default(''),
  competition: z.array(z.string()).default([]),
  objections: z
    .array(z.object({ objection: z.string(), evidence: z.array(evidenceSchema).min(1) }))
    .default([]),
  commitments: z.array(z.string()).default([]),
  nextMeeting: z.string().nullable().default(null),
  followUpEmailDraft: z.string().default(''),
});

export const salesDiscovery: MeetingTypeDefinition<
  typeof salesDiscoverySchema
> = {
  id: 'sales-discovery',
  name: 'Sales discovery',
  version: 1,
  sensitivity: 's2',
  detectionKeywords: [
    'pricing',
    'budget',
    'procurement',
    'your current process',
    'pain point',
    'decision maker',
    'proposal',
    'contract',
    'competitor',
  ],
  extractionSchema: salesDiscoverySchema,
  extractionInstructions:
    'Capture the customer, contacts, business problem, current process, pain points ' +
    'with impact, desired outcomes, budget signals, decision criteria and process, ' +
    'timeline, competition, objections, commitments made by either side, and the next ' +
    'meeting. Draft a short follow-up email. Report budget/authority statements only ' +
    'when actually said — never infer them.',
  renderDocument(structured, ctx) {
    const markdown = [
      renderBaseSections(structured, ctx),
      mdSection('Customer', structured.customer ?? ''),
      mdSection('Contacts', mdList(structured.contacts)),
      mdSection('Business problem', structured.businessProblem),
      mdSection('Pain points', mdList(structured.painPoints.map((p) => p.point))),
      mdSection('Desired outcomes', mdList(structured.desiredOutcomes)),
      mdSection('Budget signals', mdList(structured.budgetSignals)),
      mdSection('Decision criteria', mdList(structured.decisionCriteria)),
      mdSection('Decision process', structured.decisionProcess),
      mdSection('Timeline', structured.timeline),
      mdSection('Competition', mdList(structured.competition)),
      mdSection('Objections', mdList(structured.objections.map((o) => o.objection))),
      mdSection('Commitments', mdList(structured.commitments)),
      mdSection('Next meeting', structured.nextMeeting ?? ''),
      mdSection('Follow-up email draft', structured.followUpEmailDraft),
    ]
      .filter(Boolean)
      .join('\n');
    return { title: `Sales discovery — ${structured.customer ?? ctx.meetingTitle}`, markdown };
  },
  buildProposals(structured) {
    const seeds = workItemProposalsFromActions(structured.actionItems);
    if (structured.customer) {
      // CRM seam (D13): recorded as a proposal, not executable until a
      // ConqrCRM adapter exists — the proposals service marks the target
      // unavailable in validation.
      seeds.push({
        kind: 'crm_add_activity',
        targetApp: 'conqrcrm',
        title: `Log discovery call with ${structured.customer}`,
        payload: {
          customer: structured.customer,
          contacts: structured.contacts,
          summary: structured.summary,
          painPoints: structured.painPoints.map((p) => p.point),
          nextMeeting: structured.nextMeeting,
        },
        reason: 'Discovery call should be recorded on the CRM timeline',
        evidence: structured.painPoints[0]?.evidence ?? [
          { segmentIds: ['s0000'], quote: structured.summary.slice(0, 120) },
        ],
        confidence: 0.6,
        commitment: 'suggested',
        riskLevel: 'normal',
      });
    }
    if (structured.followUpEmailDraft) {
      seeds.push({
        kind: 'draft_followup_email',
        targetApp: 'conqrhub',
        title: 'Follow-up email draft',
        payload: { draft: structured.followUpEmailDraft },
        reason: 'Follow-up email drafted from commitments made in the call',
        evidence: [
          {
            segmentIds: ['s0000'],
            quote: structured.commitments[0] ?? structured.summary.slice(0, 120),
          },
        ],
        confidence: 0.5,
        commitment: 'suggested',
        // Sending email is risky (D10); the draft itself is stored, never sent.
        riskLevel: 'risky',
      });
    }
    return seeds;
  },
};

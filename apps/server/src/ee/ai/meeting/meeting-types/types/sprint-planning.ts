import { z } from 'zod';
import {
  baseExtractionSchema,
  evidenceSchema,
  MeetingTypeDefinition,
  ProposalSeed,
} from '../meeting-type.types';
import {
  mdList,
  mdSection,
  renderBaseSections,
  workItemProposalsFromActions,
} from '../render.helpers';

const sprintPlanningSchema = baseExtractionSchema.extend({
  sprintGoal: z.string().default(''),
  selectedStories: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().default(''),
        acceptanceCriteria: z.array(z.string()).default([]),
        estimate: z.string().nullable().default(null),
        owner: z.string().nullable().default(null),
        dueDate: z.string().nullable().default(null),
        evidence: z.array(evidenceSchema).min(1),
      }),
    )
    .default([]),
  dependencies: z.array(z.string()).default([]),
  capacityConcerns: z.array(z.string()).default([]),
  definitionOfDoneNotes: z.array(z.string()).default([]),
});

export const sprintPlanning: MeetingTypeDefinition<
  typeof sprintPlanningSchema
> = {
  id: 'sprint-planning',
  name: 'Sprint planning',
  version: 1,
  sensitivity: 's1',
  detectionKeywords: [
    'sprint planning',
    'sprint goal',
    'story points',
    'velocity',
    'backlog',
    'acceptance criteria',
    'capacity',
    'we selected',
    'estimated at',
  ],
  extractionSchema: sprintPlanningSchema,
  extractionInstructions:
    'Capture the sprint goal, the stories selected for the sprint (with any ' +
    'acceptance criteria, estimates, owners and deadlines that were actually ' +
    'stated), dependencies between stories/teams, capacity concerns, and ' +
    'definition-of-done clarifications. Estimates and owners must come from ' +
    'the transcript — never invent them.',
  renderDocument(structured, ctx) {
    const stories = structured.selectedStories
      .map((s) => {
        const meta = [
          s.estimate ? `estimate: ${s.estimate}` : null,
          s.owner ? `owner: ${s.owner}` : null,
          s.dueDate ? `due: ${s.dueDate}` : null,
        ]
          .filter(Boolean)
          .join(', ');
        const ac = s.acceptanceCriteria.length
          ? `\n  - Acceptance: ${s.acceptanceCriteria.join('; ')}`
          : '';
        return `- **${s.title}**${meta ? ` (${meta})` : ''}${s.description ? ` — ${s.description}` : ''}${ac}`;
      })
      .join('\n');
    const markdown = [
      renderBaseSections(structured, ctx),
      mdSection('Sprint goal', structured.sprintGoal),
      mdSection('Selected stories', stories),
      mdSection('Dependencies', mdList(structured.dependencies)),
      mdSection('Capacity concerns', mdList(structured.capacityConcerns)),
      mdSection(
        'Definition of done clarifications',
        mdList(structured.definitionOfDoneNotes),
      ),
    ]
      .filter(Boolean)
      .join('\n');
    return { title: `Sprint planning — ${ctx.meetingDate}`, markdown };
  },
  buildProposals(structured) {
    const storySeeds: ProposalSeed[] = structured.selectedStories.map((s) => ({
      kind: 'create_work_item',
      targetApp: 'conqrplane' as const,
      title: s.title,
      payload: {
        name: s.title,
        description: [
          s.description,
          s.acceptanceCriteria.length
            ? `Acceptance criteria:\n- ${s.acceptanceCriteria.join('\n- ')}`
            : '',
          s.estimate ? `Estimate: ${s.estimate}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        priority: 'medium',
        ownerHint: s.owner,
        dueDate: s.dueDate,
      },
      reason: 'Story selected for the sprint in planning',
      evidence: s.evidence,
      confidence: 0.9,
      commitment: 'explicit' as const,
      // Assigning to a named owner is a risky action (D10).
      riskLevel: s.owner ? ('risky' as const) : ('normal' as const),
    }));
    return [
      ...storySeeds,
      ...workItemProposalsFromActions(structured.actionItems),
    ];
  },
};

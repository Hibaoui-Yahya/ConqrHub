import { z } from 'zod';
import {
  actionItemSchema,
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

const standupSchema = baseExtractionSchema.extend({
  updates: z
    .array(
      z.object({
        participant: z.string().min(1),
        done: z.array(z.string()).default([]),
        next: z.array(z.string()).default([]),
        blockers: z.array(z.string()).default([]),
        helpRequests: z.array(z.string()).default([]),
        evidence: z.array(evidenceSchema).min(1),
      }),
    )
    .default([]),
  dependencies: z.array(z.string()).default([]),
  blockerActions: z.array(actionItemSchema).default([]),
});

export const dailyStandup: MeetingTypeDefinition<typeof standupSchema> = {
  id: 'daily-standup',
  name: 'Daily stand-up',
  version: 1,
  sensitivity: 's1',
  detectionKeywords: [
    'standup',
    'stand-up',
    'daily',
    'yesterday i',
    'today i will',
    'blockers',
    'blocked by',
  ],
  extractionSchema: standupSchema,
  extractionInstructions:
    'For each participant capture what they completed, what they will do next, ' +
    'their blockers and requests for help. Capture cross-participant dependencies. ' +
    'Turn blockers that need work into blockerActions.',
  renderDocument(structured, ctx) {
    const updates = structured.updates
      .map((u) =>
        [
          `### ${u.participant}`,
          u.done.length ? `**Done:**\n${mdList(u.done)}` : '',
          u.next.length ? `**Next:**\n${mdList(u.next)}` : '',
          u.blockers.length ? `**Blockers:**\n${mdList(u.blockers)}` : '',
          u.helpRequests.length ? `**Needs help:**\n${mdList(u.helpRequests)}` : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
      )
      .join('\n\n');
    const markdown = [
      renderBaseSections(structured, ctx),
      mdSection('Per-participant updates', updates),
      mdSection('Dependencies', mdList(structured.dependencies)),
    ]
      .filter(Boolean)
      .join('\n');
    return { title: `Stand-up — ${ctx.meetingDate}`, markdown };
  },
  buildProposals(structured) {
    return workItemProposalsFromActions([
      ...structured.actionItems,
      ...structured.blockerActions,
    ]);
  },
};

import {
  baseExtractionSchema,
  MeetingTypeDefinition,
} from '../meeting-type.types';
import {
  decisionRecordProposals,
  renderBaseSections,
  workItemProposalsFromActions,
} from '../render.helpers';

export const genericMeeting: MeetingTypeDefinition<
  typeof baseExtractionSchema
> = {
  id: 'generic-meeting',
  name: 'Generic meeting',
  version: 1,
  sensitivity: 's1',
  detectionKeywords: [],
  extractionSchema: baseExtractionSchema,
  extractionInstructions:
    'Produce an executive summary, main discussion topics, key points, decisions, ' +
    'action items, open questions, risks and follow-ups. Distinguish final from ' +
    'provisional decisions and explicit commitments from suggested actions.',
  renderDocument(structured, ctx) {
    return {
      title: `Meeting notes — ${ctx.meetingTitle}`,
      markdown: renderBaseSections(structured, ctx),
    };
  },
  buildProposals(structured) {
    return [
      ...workItemProposalsFromActions(structured.actionItems),
      ...decisionRecordProposals(structured.decisions),
    ];
  },
};

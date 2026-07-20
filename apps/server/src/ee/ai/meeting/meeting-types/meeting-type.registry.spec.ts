import {
  classifyByRules,
  DEFAULT_MEETING_TYPE,
  getMeetingType,
  hasMeetingType,
  listMeetingTypes,
  SENSITIVE_TYPES,
} from './meeting-type.registry';
import { baseExtractionSchema } from './meeting-type.types';

describe('meeting type registry', () => {
  it('registers the MVP-wired types', () => {
    for (const id of [
      'generic-meeting',
      'daily-standup',
      'sales-discovery',
      'recruitment-interview',
    ]) {
      expect(hasMeetingType(id)).toBe(true);
    }
  });

  it('falls back to generic for unknown ids', () => {
    expect(getMeetingType('board-of-wizards').id).toBe(DEFAULT_MEETING_TYPE);
  });

  it('marks recruitment interviews as sensitive (s3)', () => {
    expect(SENSITIVE_TYPES.has('recruitment-interview')).toBe(true);
    expect(SENSITIVE_TYPES.has('generic-meeting')).toBe(false);
  });

  it('every definition has a valid schema, renderer and proposal builder', () => {
    const sample = baseExtractionSchema.parse({
      summary: 'We met.',
      decisions: [],
      actionItems: [
        {
          title: 'Do the thing',
          evidence: [{ segmentIds: ['s0001'], quote: 'please do the thing' }],
        },
      ],
    });
    const ctx = {
      meetingTitle: 'Test',
      meetingDate: '2026-07-20',
      meetingType: 'Test',
      speakers: ['A'],
    };
    for (const def of listMeetingTypes()) {
      // Base extraction must satisfy every extended schema's base fields.
      const parsed = def.extractionSchema.safeParse(sample);
      expect(parsed.success).toBe(true);
      const rendered = def.renderDocument(parsed.data as never, ctx);
      expect(rendered.title.length).toBeGreaterThan(0);
      expect(rendered.markdown).toContain('Summary');
      expect(Array.isArray(def.buildProposals(parsed.data as never, ctx))).toBe(
        true,
      );
    }
  });

  it('classifies standup language by rules', () => {
    const hit = classifyByRules(
      'quick daily standup: yesterday i shipped the api, today i will fix the ui, no blockers',
    );
    expect(hit?.typeId).toBe('daily-standup');
    expect(hit!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('returns null when no rule clears the two-keyword floor', () => {
    expect(classifyByRules('we discussed the weather and lunch')).toBeNull();
  });

  it('extraction schemas require evidence on action items', () => {
    const def = getMeetingType('generic-meeting');
    const invalid = def.extractionSchema.safeParse({
      summary: 'x',
      actionItems: [{ title: 'no evidence' }],
    });
    expect(invalid.success).toBe(false);
  });
});

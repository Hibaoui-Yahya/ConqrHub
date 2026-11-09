import {
  dateRange,
  listSettings,
  parseStatuses,
  splitList,
  toMeetingListItem,
} from './meeting-list.util';

describe('meeting list items (Strict Private, phase 0)', () => {
  const full = {
    id: 'm1',
    title: 'Entrevue — Analyste',
    status: 'completed',
    userId: 'u1',
    canEdit: true,
    transcript: 'Speaker 1: mes attentes salariales…',
    aiOutputs: { summary: 'Résumé confidentiel' },
    cost: { usd: 0.42 },
    settings: {
      template: { id: 't1', name: 'Entrevue', version: 3, spec: { grid: {} } },
      publishedBundle: { meetingPageId: 'p1', transcriptPageId: 'p2', spaceId: 's1' },
      evaluation: { status: 'validated', overall: { recommendation: 'advance' } },
      markers: [{ kind: 'compensation', note: 'salaire' }],
    },
  };

  it('drops the transcript, AI outputs, cost and every sensitive setting', () => {
    const item = toMeetingListItem(full);
    expect(item).not.toHaveProperty('transcript');
    expect(item).not.toHaveProperty('aiOutputs');
    expect(item).not.toHaveProperty('cost');
    expect(item.settings).toEqual({
      template: { id: 't1', name: 'Entrevue' },
      publishedBundle: { meetingPageId: 'p1' },
    });
    expect(JSON.stringify(item)).not.toMatch(/salari|confidentiel|validated|compensation/);
  });

  it('keeps what the lists show', () => {
    expect(toMeetingListItem(full)).toMatchObject({
      id: 'm1',
      title: 'Entrevue — Analyste',
      status: 'completed',
      userId: 'u1',
      canEdit: true,
    });
  });

  it('reads odd settings safely', () => {
    expect(listSettings(null)).toBeNull();
    expect(listSettings('{"evaluation":{}}')).toBeNull();
    expect(listSettings([])).toBeNull();
    expect(listSettings({ template: { id: 7 }, publishedBundle: {} })).toEqual({
      template: { id: null, name: null },
    });
  });
});

describe('meeting list filters', () => {
  it('splits comma lists without blanks or duplicates', () => {
    expect(splitList('a, b,,a')).toEqual(['a', 'b']);
    expect(splitList(undefined)).toEqual([]);
  });

  it('accepts known statuses only', () => {
    expect(parseStatuses('completed,archived')).toEqual({ ok: true, statuses: ['completed', 'archived'] });
    expect(parseStatuses('completed,done')).toEqual({ ok: false, unknown: 'done' });
  });

  it('includes the whole "to" day for a bare date and is inclusive for a date-time', () => {
    const day = dateRange('2026-10-01', '2026-10-16');
    expect(day.from?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(day.toExclusive?.toISOString()).toBe('2026-10-17T00:00:00.000Z');
    const exact = dateRange(undefined, '2026-10-16T12:00:00Z');
    expect(exact.from).toBeNull();
    expect(exact.toExclusive?.toISOString()).toBe('2026-10-16T12:00:00.001Z');
    expect(dateRange('2026-10-16', '2026-10-16').invalid).toBe(false);
  });

  it('flags a reversed or unreadable range', () => {
    expect(dateRange('2026-10-17', '2026-10-16').invalid).toBe(true);
    expect(dateRange('yesterday').invalid).toBe(true);
  });
});

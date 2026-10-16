import { dateRange, parseStatuses, splitList } from './meeting-list.util';

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

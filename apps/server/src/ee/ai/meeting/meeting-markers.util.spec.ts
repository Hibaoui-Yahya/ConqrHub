import {
  MAX_MARKER_NOTE,
  MAX_MARKERS,
  normalizeMarkers,
} from './meeting-markers.util';

describe('normalizeMarkers', () => {
  it('returns an empty list for anything that is not an array', () => {
    expect(normalizeMarkers(undefined)).toEqual([]);
    expect(normalizeMarkers({ atMs: 1 })).toEqual([]);
    expect(normalizeMarkers('x')).toEqual([]);
  });

  it('keeps valid markers sorted by time, rounding offsets', () => {
    expect(
      normalizeMarkers([
        { atMs: 5000.4, kind: 'concern', note: '  salaire  ' },
        { atMs: 1200, kind: 'highlight' },
      ]),
    ).toEqual([
      { atMs: 1200, kind: 'highlight' },
      { atMs: 5000, kind: 'concern', note: 'salaire' },
    ]);
  });

  it('skips malformed entries instead of rejecting the whole list', () => {
    expect(
      normalizeMarkers([
        null,
        { atMs: -1 },
        { atMs: Number.NaN },
        { atMs: 'soon' },
        { atMs: 25 * 60 * 60 * 1000 },
        { atMs: 10 },
      ]),
    ).toEqual([{ atMs: 10, kind: 'moment' }]);
  });

  it('falls back to a plain moment for an unknown kind', () => {
    expect(normalizeMarkers([{ atMs: 1, kind: 'hack' }])).toEqual([
      { atMs: 1, kind: 'moment' },
    ]);
  });

  it('drops exact duplicates and empty notes', () => {
    expect(
      normalizeMarkers([
        { atMs: 1, kind: 'moment', note: ' ' },
        { atMs: 1, kind: 'moment' },
      ]),
    ).toEqual([{ atMs: 1, kind: 'moment' }]);
  });

  it('caps the number of markers and the note length', () => {
    const many = Array.from({ length: MAX_MARKERS + 50 }, (_, i) => ({
      atMs: i,
    }));
    expect(normalizeMarkers(many)).toHaveLength(MAX_MARKERS);
    const [m] = normalizeMarkers([{ atMs: 0, note: 'a'.repeat(900) }]);
    expect(m.note).toHaveLength(MAX_MARKER_NOTE);
  });
});

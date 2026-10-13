import {
  buildMeetingPageMarkdown,
  buildTranscriptMarkdown,
  formatStamp,
} from './meeting-publish.util';

describe('formatStamp', () => {
  it('formats minutes and hours', () => {
    expect(formatStamp(65_000)).toBe('01:05');
    expect(formatStamp(3_725_000)).toBe('1:02:05');
    expect(formatStamp(-5)).toBe('00:00');
  });
});

describe('buildTranscriptMarkdown', () => {
  const speakers = { S1: { displayName: 'Annie Bissonnette' }, S2: { displayName: null } };

  it('groups consecutive passages per speaker with their start time', () => {
    const md = buildTranscriptMarkdown(
      [
        { speaker: 'S1', startMs: 0, text: 'Bonjour.' },
        { speaker: 'S1', startMs: 2000, text: ' Merci   d’être là.' },
        { speaker: 'S2', startMs: 5000, text: 'Avec plaisir.' },
        { speaker: 'S2', startMs: 6000, text: '   ' },
      ],
      speakers,
    );
    expect(md).toBe(
      '## Transcription\n\n**Annie Bissonnette** · 00:00\n\nBonjour. Merci d’être là.\n\n**S2** · 00:05\n\nAvec plaisir.\n',
    );
  });

  it('lists marked moments before the transcript', () => {
    const md = buildTranscriptMarkdown(
      [{ speaker: 'S1', startMs: 0, text: 'Bonjour.' }],
      speakers,
      [{ atMs: 61_000, kind: 'concern', note: 'salaire' }, { atMs: 5000, kind: 'moment' }],
    );
    expect(md).toContain('## Moments marqués\n\n- **01:01** · Vigilance — salaire\n- **00:05** · Moment\n');
    expect(md.indexOf('## Moments marqués')).toBeLessThan(md.indexOf('## Transcription'));
  });

  it('says so when nothing was transcribed', () => {
    expect(buildTranscriptMarkdown([], {})).toContain('_Aucun contenu transcrit._');
  });
});

describe('buildMeetingPageMarkdown', () => {
  it('includes the date line, summary and next steps', () => {
    const md = buildMeetingPageMarkdown({
      startedAt: '2026-10-13T14:00:00Z',
      durationMs: 47 * 60000,
      summary: 'Profil solide.',
      nextSteps: '- Rencontre client',
    });
    expect(md).toMatch(/^_Réunion du .+ · 47 min · publiée depuis ConqrMeet\._/);
    expect(md).toContain('## Résumé\n\nProfil solide.');
    expect(md).toContain('## Prochaines étapes\n\n- Rencontre client');
  });

  it('skips empty sections', () => {
    const md = buildMeetingPageMarkdown({ startedAt: null, durationMs: null });
    expect(md).not.toContain('## Résumé');
    expect(md).toContain('Le rapport et la transcription');
  });
});

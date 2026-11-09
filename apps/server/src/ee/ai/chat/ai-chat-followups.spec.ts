jest.mock('../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import { buildSystemPrompt, parseFollowUps } from './ai-chat-stream.service';

describe('parseFollowUps', () => {
  it('strips numbering, bullets and quotes, keeps at most three', () => {
    const raw = [
      '1. Que prévoit le guide si la période d’essai est rompue ?',
      '- « Quels clients appliquent une durée différente ? »',
      '* Rédige le paragraphe sur la période d’essai',
      '4) Une quatrième question bien formulée ?',
    ].join('\n');
    expect(parseFollowUps(raw)).toEqual([
      'Que prévoit le guide si la période d’essai est rompue ?',
      'Quels clients appliquent une durée différente ?',
      'Rédige le paragraphe sur la période d’essai',
    ]);
  });

  it('drops blanks, too-short lines and duplicates', () => {
    expect(parseFollowUps('ok\n\nWhat about remote work?\nwhat about remote work?')).toEqual([
      'What about remote work?',
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseFollowUps('')).toEqual([]);
  });
});

describe('buildSystemPrompt deep mode', () => {
  it('adds the deep-mode block only when asked', () => {
    expect(buildSystemPrompt('fr-FR')).not.toContain('DEEP MODE');
    const deep = buildSystemPrompt('fr-FR', undefined, 'deep');
    expect(deep).toContain('DEEP MODE');
    expect(deep).toMatch(/get_page/);
    expect(deep).not.toMatch(/—/);
  });
});

import { dropChannelEchoes } from './meeting-echo.util';
import type { TranscriptSegment } from './meeting-transcript.util';

let n = 0;
const line = (
  channel: 'mic' | 'system' | null,
  text: string,
  startMs: number,
  endMs: number,
  speaker = channel === 'system' ? 'Participant 1' : 'Me',
): TranscriptSegment => ({
  id: `s${++n}`,
  speaker,
  channel,
  startMs,
  endMs,
  text,
  rawText: text,
  confidence: null,
  attribution: 'acoustic',
  timing: 'measured',
});

describe('dropChannelEchoes', () => {
  it('drops the microphone copy of a sentence heard in the meeting audio', () => {
    const remote = line(
      'system',
      "Ah oui, c'est ça, dans tous les onglets.",
      7_000,
      8_100,
    );
    const echo = line(
      'mic',
      "Ah oui, c'est ça, dans tous les onglets.",
      7_050,
      8_150,
    );
    const { kept, dropped } = dropChannelEchoes([remote, echo]);
    expect(kept).toEqual([remote]);
    expect(dropped).toEqual([echo]);
  });

  it('recognises the echo despite small recognition differences', () => {
    // The two channels are transcribed separately: a word or two differ.
    const remote = line(
      'system',
      'Good, super. Est-ce que la section, juste si tu montes un petit peu plus haut, où il y a les champs, la section titre de poste, ce qu’on voulait, c’était de pouvoir, mettons qu’on a… Directeur ou comme conseiller, pouvoir en sélectionner plusieurs.',
      9_000,
      34_000,
    );
    const echo = line(
      'mic',
      'Good, super. Est-ce que la section, juste si tu montres un petit peu plus haut, où est-ce que les champs, la section titre de poste, ce qu’on voulait, c’était de pouvoir, mettons qu’on ait… Directeur ou comme conseiller ou autre, pouvoir en sélectionner plusieurs.',
      9_100,
      34_200,
    );
    expect(dropChannelEchoes([remote, echo]).dropped).toEqual([echo]);
  });

  it('keeps what the person at the microphone says', () => {
    const remote = line(
      'system',
      'Tu peux partager ton écran avec nous ?',
      1_000,
      3_000,
    );
    const local = line(
      'mic',
      'Oui, je le partage tout de suite, une seconde.',
      3_500,
      6_000,
    );
    const { kept, dropped } = dropChannelEchoes([remote, local]);
    expect(kept).toEqual([remote, local]);
    expect(dropped).toEqual([]);
  });

  it('keeps simultaneous but different speech, even with many common words', () => {
    const remote = line(
      'system',
      'Il faut que la page de la section soit prête pour la fin de la semaine et que le client la valide.',
      10_000,
      16_000,
    );
    const local = line(
      'mic',
      'Je pense que la date de la démo est trop proche pour le client.',
      11_000,
      15_000,
    );
    expect(dropChannelEchoes([remote, local]).dropped).toEqual([]);
  });

  it('does not drop an echo far from the meeting-audio sentence it repeats', () => {
    const remote = line(
      'system',
      'On a élargi la recherche dans tout le profil.',
      0,
      2_000,
    );
    const later = line(
      'mic',
      'On a élargi la recherche dans tout le profil.',
      60_000,
      62_000,
    );
    expect(dropChannelEchoes([remote, later]).dropped).toEqual([]);
  });

  it('matches across meeting-audio lines split differently from the microphone line', () => {
    const a = line('system', 'On a élargi la recherche', 0, 1_500);
    const b = line('system', 'dans tout le profil du candidat.', 1_600, 3_000);
    const echo = line(
      'mic',
      'On a élargi la recherche dans tout le profil du candidat.',
      50,
      3_100,
    );
    expect(dropChannelEchoes([a, b, echo]).dropped).toEqual([echo]);
  });

  it('drops a short echo only when it is repeated in full at the same moment', () => {
    const remote = line('system', "D'accord.", 20_000, 20_600);
    const echo = line('mic', "D'accord.", 20_100, 20_700);
    const ownReply = line('mic', 'Oui.', 23_000, 23_300);
    const { dropped } = dropChannelEchoes([remote, echo, ownReply]);
    expect(dropped).toEqual([echo]);
  });

  it('leaves a microphone-only or meeting-audio-only transcript untouched', () => {
    const mic = [
      line('mic', 'Bonjour à tous.', 0, 1_000),
      line('mic', 'Bonjour à tous.', 1_200, 2_000),
    ];
    expect(dropChannelEchoes(mic)).toEqual({ kept: mic, dropped: [] });
    const single = [line(null, 'Bonjour.', 0, 500)];
    expect(dropChannelEchoes(single)).toEqual({ kept: single, dropped: [] });
  });

  it('keeps the order of the remaining lines', () => {
    const s1 = line('system', 'Première question pour toi.', 0, 2_000);
    const e1 = line('mic', 'Première question pour toi.', 10, 2_010);
    const m1 = line('mic', 'Je réponds à la première question.', 2_500, 5_000);
    const s2 = line(
      'system',
      'Merci, deuxième question maintenant.',
      5_500,
      7_000,
    );
    const { kept } = dropChannelEchoes([s1, e1, m1, s2]);
    expect(kept.map((s) => s.id)).toEqual([s1.id, m1.id, s2.id]);
  });
});

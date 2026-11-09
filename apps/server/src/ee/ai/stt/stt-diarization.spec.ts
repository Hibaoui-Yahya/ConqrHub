import { SttService } from './stt.service';
jest.mock('../providers/ai-provider.service', () => ({
  AiProviderService: class {},
}));
jest.mock('@docmost/db/repos/page/page.repo', () => ({ PageRepo: class {} }));

describe('meeting acoustic transcription', () => {
  const fetchOriginal = global.fetch;
  const request = jest.fn();
  const provider = { generate: jest.fn() };
  const service = () =>
    new SttService(
      {
        getMistralApiKey: () => 'qa-key',
        getAiSttModel: () => 'voxtral-mini-latest',
      } as any,
      provider as any,
      {} as any,
    );
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = request;
  });
  afterAll(() => {
    global.fetch = fetchOriginal;
  });
  it('uses the supported diarization settings and sanitizes vocabulary tokens', async () => {
    request.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          text: 'Bonjour. Oui.',
          language: 'fr',
          segments: [
            { text: 'Oui.', speaker_id: 'second', start: 3, end: 4 },
            { text: 'Bonjour.', speaker_id: 'first', start: 1.25, end: 2 },
            { text: 'Bad timing.', speaker_id: 'third', start: 'bad', end: 6 },
          ],
        }),
    });
    const result = await service().transcribeDiarized(
      Buffer.from('wav'),
      'audio/wav',
      ['La Tête Chercheuse', 'La,Tête'],
    );
    const form = request.mock.calls[0][1].body as FormData;
    expect(form.get('diarize')).toBe('true');
    expect(form.get('timestamp_granularities')).toBe('segment');
    expect(form.get('context_bias')).toBe('La,Tête,Chercheuse');
    expect(form.has('language')).toBe(false);
    expect(form.has('verbatim')).toBe(false);
    expect(
      result.segments.map((s) => [s.speakerId, s.startMs, s.endMs]),
    ).toEqual([
      [null, 0, 0],
      ['first', 1250, 2000],
      ['second', 3000, 4000],
    ]);
    expect(result.segments[0].text).toBe('Bad timing.');
    expect(result.segments[0].timing).toBe('estimated');
    expect(provider.generate).not.toHaveBeenCalled();
  });
  it('keeps unassigned speaker ids explicit and never invents them', async () => {
    request.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          text: 'Maybe.',
          segments: [{ text: 'Maybe.', start: 2, end: 1, speaker_id: null }],
        }),
    });
    const result = await service().transcribeDiarized(
      Buffer.from('wav'),
      'audio/wav',
    );
    expect(result.segments[0]).toEqual({
      text: 'Maybe.',
      startMs: 2000,
      endMs: 2000,
      speakerId: null,
      timing: 'measured',
    });
  });
  it('surfaces provider failures so the meeting fallback remains reviewable', async () => {
    request.mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'unsupported combination',
    });
    await expect(
      service().transcribeDiarized(Buffer.from('wav'), 'audio/wav'),
    ).rejects.toThrow('Transcription failed');
  });
});

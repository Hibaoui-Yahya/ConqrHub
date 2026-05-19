import { SttService } from './stt.service';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const envMock = {
  getMistralApiKey: jest.fn(() => 'sk-test'),
  getAiSttEnabled: jest.fn(() => true),
  getAiSttModel: jest.fn(() => 'voxtral-small-2507'),
};

const providerMock = {
  generate: jest.fn(
    async (_args: {
      system?: string;
      prompt: string;
      temperature?: number;
      maxOutputTokens?: number;
    }) => ({ text: 'Corrected transcript.' }),
  ),
};

const pageRepoMock = {
  findById: jest.fn(),
};

function makeService() {
  return new SttService(envMock as any, providerMock as any, pageRepoMock as any);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SttService.transcribeAndCorrect', () => {
  const audio = Buffer.from('fake-audio-bytes');

  it('happy path: returns raw + corrected', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'raw transcript' }),
    });

    const result = await makeService().transcribeAndCorrect(
      audio,
      'audio/webm',
      { kind: 'search' },
      'workspace-id',
      'Acme Wiki',
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.mistral.ai/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.raw).toBe('raw transcript');
    expect(result.corrected).toBe('Corrected transcript.');
    expect(result.model).toBe('voxtral-small-2507');
    expect(typeof result.durationMs).toBe('number');
    expect(providerMock.generate).toHaveBeenCalledTimes(1);
  });

  it('falls back to raw when correction throws', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'raw text' }),
    });
    providerMock.generate.mockRejectedValueOnce(new Error('boom'));

    const result = await makeService().transcribeAndCorrect(
      audio,
      'audio/webm',
      { kind: 'search' },
      'workspace-id',
      'Acme Wiki',
    );

    expect(result.raw).toBe('raw text');
    expect(result.corrected).toBe('raw text');
  });

  it('returns empty corrected when raw is empty (no LLM call)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: '' }),
    });

    const result = await makeService().transcribeAndCorrect(
      audio,
      'audio/webm',
      { kind: 'search' },
      'workspace-id',
      'Acme Wiki',
    );

    expect(result.raw).toBe('');
    expect(result.corrected).toBe('');
    expect(providerMock.generate).not.toHaveBeenCalled();
  });

  it('throws when Mistral returns non-OK', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'server error',
    });

    await expect(
      makeService().transcribeAndCorrect(
        audio,
        'audio/webm',
        { kind: 'search' },
        'workspace-id',
        'Acme Wiki',
      ),
    ).rejects.toThrow(/transcription failed/i);
    expect(providerMock.generate).not.toHaveBeenCalled();
  });

  it('resolves page title for kind=page and includes it in correction prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'lets discuss voxtral migration' }),
    });
    pageRepoMock.findById.mockResolvedValueOnce({
      id: 'page-id',
      title: 'Voxtral Migration Plan',
      textContent: 'Some surrounding text about Voxtral migration steps.',
      workspaceId: 'workspace-id',
    });

    await makeService().transcribeAndCorrect(
      audio,
      'audio/webm',
      { kind: 'page', pageId: 'page-id' },
      'workspace-id',
      'Acme Wiki',
    );

    const call = providerMock.generate.mock.calls[0]?.[0];
    expect(call?.prompt).toContain('Voxtral Migration Plan');
    expect(call?.prompt).toContain('lets discuss voxtral migration');
    expect(call?.temperature ?? 1).toBeLessThanOrEqual(0.2);
  });

  it('rejects when page belongs to a different workspace', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'raw' }),
    });
    pageRepoMock.findById.mockResolvedValueOnce({
      id: 'page-id',
      title: 'Other workspace page',
      textContent: '',
      workspaceId: 'someone-else',
    });

    await expect(
      makeService().transcribeAndCorrect(
        audio,
        'audio/webm',
        { kind: 'page', pageId: 'page-id' },
        'workspace-id',
        'Acme Wiki',
      ),
    ).rejects.toThrow(/forbidden|workspace/i);
  });

  it('skips page lookup for kind=search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'raw' }),
    });

    await makeService().transcribeAndCorrect(
      audio,
      'audio/webm',
      { kind: 'search' },
      'workspace-id',
      'Acme Wiki',
    );

    expect(pageRepoMock.findById).not.toHaveBeenCalled();
  });
});

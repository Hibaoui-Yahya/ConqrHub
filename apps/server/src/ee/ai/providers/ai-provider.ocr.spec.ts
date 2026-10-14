import { AiProviderService, OcrProviderError } from './ai-provider.service';

function makeEnv(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    getMistralApiKey: 'test-key',
    getAiOcrEnabled: true,
    getAiOcrModel: 'mistral-ocr-latest',
    getAiDriver: '',
    ...overrides,
  };
  return new Proxy(
    {},
    { get: (_t, prop: string) => () => values[prop] },
  ) as any;
}

function response(status: number, body: unknown) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as Response;
}

describe('AiProviderService.ocrDocument (Mistral OCR)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('sends the bytes inline (data URI) with a page bound — never a URL to fetch', async () => {
    fetchSpy.mockResolvedValue(
      response(200, {
        model: 'mistral-ocr-2505',
        pages: [
          { index: 1, markdown: 'Page deux' },
          { index: 0, markdown: 'Page un' },
        ],
        usage_info: { pages_processed: 2 },
      }),
    );
    const svc = new AiProviderService(makeEnv());
    const data = Buffer.from('%PDF-1.4 scanned');

    const res = await svc.ocrDocument({
      data,
      mimeType: 'application/pdf',
      pages: [0, 1],
      timeoutMs: 5000,
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/ocr');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${data.toString('base64')}`,
      },
      include_image_base64: false,
      pages: [0, 1],
    });
    expect(init.signal).toBeDefined();
    expect(res).toEqual({
      model: 'mistral-ocr-2505',
      pages: [
        { index: 1, markdown: 'Page deux' },
        { index: 0, markdown: 'Page un' },
      ],
      pagesProcessed: 2,
    });
  });

  it('sends images as image_url data URIs without a page list', async () => {
    fetchSpy.mockResolvedValue(
      response(200, { pages: [{ index: 0, markdown: 'x' }] }),
    );
    const svc = new AiProviderService(makeEnv());
    await svc.ocrDocument({
      data: Buffer.from([1, 2]),
      mimeType: 'image/png',
      pages: [0],
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.document).toEqual({
      type: 'image_url',
      image_url: 'data:image/png;base64,AQI=',
    });
    expect(body.pages).toBeUndefined();
  });

  it.each([
    [429, true],
    [500, true],
    [503, true],
    [408, true],
    [400, false],
    [401, false],
    [413, false],
    [422, false],
  ])('classifies HTTP %i as retryable=%s', async (status, retryable) => {
    fetchSpy.mockResolvedValue(response(status, { message: 'nope' }));
    const svc = new AiProviderService(makeEnv());
    const err = await svc
      .ocrDocument({ data: Buffer.from('x'), mimeType: 'image/png' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(OcrProviderError);
    expect(err).toMatchObject({ retryable, status });
  });

  it('treats a timeout or network failure as retryable', async () => {
    const timeout = Object.assign(new Error('aborted'), {
      name: 'TimeoutError',
    });
    fetchSpy
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const svc = new AiProviderService(makeEnv());
    for (const msg of [/timed out/, /fetch failed/]) {
      const err = await svc
        .ocrDocument({ data: Buffer.from('x'), mimeType: 'image/png' })
        .catch((e) => e);
      expect(err).toMatchObject({ retryable: true });
      expect(err.message).toMatch(msg);
    }
  });

  it('rejects a malformed success body as retryable', async () => {
    fetchSpy.mockResolvedValue(response(200, '<html>gateway</html>'));
    const svc = new AiProviderService(makeEnv());
    await expect(
      svc.ocrDocument({ data: Buffer.from('x'), mimeType: 'image/png' }),
    ).rejects.toMatchObject({ retryable: true });
  });

  it('does not call the network when OCR is disabled or keyless', async () => {
    for (const env of [
      makeEnv({ getAiOcrEnabled: false }),
      makeEnv({ getMistralApiKey: '' }),
    ]) {
      const svc = new AiProviderService(env);
      expect(svc.isOcrAvailable()).toBe(false);
      await expect(
        svc.ocrDocument({ data: Buffer.from('x'), mimeType: 'image/png' }),
      ).rejects.toMatchObject({ retryable: false });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

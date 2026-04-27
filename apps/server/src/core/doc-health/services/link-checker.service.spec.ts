import { LinkCheckerService } from './link-checker.service';

function buildHarness(opts: { enabled?: boolean; timeoutMs?: number; concurrency?: number } = {}) {
  const env: any = {
    getDocHealthExternalChecksEnabled: () => opts.enabled ?? true,
    getDocHealthExternalCheckTimeoutMs: () => opts.timeoutMs ?? 5000,
    getDocHealthExternalCheckConcurrency: () => opts.concurrency ?? 5,
  };
  const service = new LinkCheckerService(env);
  return { service };
}

describe('LinkCheckerService', () => {
  describe('check', () => {
    it('returns ok for 2xx responses', async () => {
      const { service } = buildHarness();
      service.setFetcher(async () => ({ ok: true, status: 200 }) as any);
      const result = await service.check('https://example.com/x');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.httpStatus).toBe(200);
    });

    it('classifies 4xx as http_4xx', async () => {
      const { service } = buildHarness();
      service.setFetcher(async () => ({ ok: false, status: 404 }) as any);
      const result = await service.check('https://example.com/missing');
      expect(result.ok).toBe(false);
      if (result.ok === false) {
        expect(result.reason).toBe('http_4xx');
        expect(result.httpStatus).toBe(404);
      }
    });

    it('classifies 5xx as http_5xx', async () => {
      const { service } = buildHarness();
      service.setFetcher(async () => ({ ok: false, status: 503 }) as any);
      const result = await service.check('https://example.com/down');
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.reason).toBe('http_5xx');
    });

    it('falls back to GET when HEAD returns 405', async () => {
      const { service } = buildHarness();
      const calls: string[] = [];
      service.setFetcher(async (_url, init) => {
        calls.push(init.method);
        if (init.method === 'HEAD')
          return { ok: false, status: 405 } as any;
        return { ok: true, status: 200 } as any;
      });
      const result = await service.check('https://example.com/y');
      expect(result.ok).toBe(true);
      expect(calls).toEqual(['HEAD', 'GET']);
    });

    it('falls back to GET when HEAD returns 501', async () => {
      const { service } = buildHarness();
      const calls: string[] = [];
      service.setFetcher(async (_url, init) => {
        calls.push(init.method);
        if (init.method === 'HEAD')
          return { ok: false, status: 501 } as any;
        return { ok: true, status: 200 } as any;
      });
      const result = await service.check('https://example.com/y');
      expect(result.ok).toBe(true);
      expect(calls).toEqual(['HEAD', 'GET']);
    });

    it('classifies AbortError as timeout', async () => {
      const { service } = buildHarness();
      service.setFetcher(async () => {
        const e = new Error('aborted');
        (e as any).name = 'AbortError';
        throw e;
      });
      const result = await service.check('https://example.com/slow');
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.reason).toBe('timeout');
    });

    it('classifies DNS errors', async () => {
      const { service } = buildHarness();
      service.setFetcher(async () => {
        throw new Error(
          'getaddrinfo ENOTFOUND nowhere.invalid',
        );
      });
      const result = await service.check('https://nowhere.invalid/');
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.reason).toBe('dns');
    });

    it('classifies connection refused as dns category', async () => {
      const { service } = buildHarness();
      service.setFetcher(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:443');
      });
      const result = await service.check('https://localhost/');
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.reason).toBe('dns');
    });

    it('classifies unknown errors', async () => {
      const { service } = buildHarness();
      service.setFetcher(async () => {
        throw new Error('something weird');
      });
      const result = await service.check('https://example.com/');
      expect(result.ok).toBe(false);
      if (result.ok === false) expect(result.reason).toBe('unknown');
    });
  });

  describe('isEnabled', () => {
    it('returns false when env disables external checks', () => {
      const { service } = buildHarness({ enabled: false });
      expect(service.isEnabled()).toBe(false);
    });

    it('returns true by default', () => {
      const { service } = buildHarness();
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('checkBatch', () => {
    it('returns an empty map for an empty input', async () => {
      const { service } = buildHarness();
      const result = await service.checkBatch([]);
      expect(result.size).toBe(0);
    });

    it('checks every URL exactly once', async () => {
      const { service } = buildHarness({ concurrency: 3 });
      const seen: string[] = [];
      service.setFetcher(async (url) => {
        seen.push(url);
        return { ok: true, status: 200 } as any;
      });
      const urls = [
        'https://a.test',
        'https://b.test',
        'https://c.test',
        'https://d.test',
      ];
      const result = await service.checkBatch(urls);
      expect(result.size).toBe(4);
      expect(seen.sort()).toEqual([...urls].sort());
    });

    it('respects the concurrency limit', async () => {
      const { service } = buildHarness({ concurrency: 2 });
      let active = 0;
      let peak = 0;
      service.setFetcher(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return { ok: true, status: 200 } as any;
      });
      await service.checkBatch([
        'https://a.test',
        'https://b.test',
        'https://c.test',
        'https://d.test',
        'https://e.test',
        'https://f.test',
      ]);
      expect(peak).toBeLessThanOrEqual(2);
    });

    it('continues after individual failures', async () => {
      const { service } = buildHarness({ concurrency: 1 });
      service.setFetcher(async (url) => {
        if (url === 'https://b.test') throw new Error('boom');
        return { ok: true, status: 200 } as any;
      });
      const result = await service.checkBatch([
        'https://a.test',
        'https://b.test',
        'https://c.test',
      ]);
      expect(result.get('https://a.test')?.ok).toBe(true);
      expect(result.get('https://b.test')?.ok).toBe(false);
      expect(result.get('https://c.test')?.ok).toBe(true);
    });
  });
});

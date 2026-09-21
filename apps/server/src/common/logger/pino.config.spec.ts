import { createPinoConfig } from './pino.config';

describe('Pino credential redaction', () => {
  it('redacts both service authorization and delegated assertion headers', () => {
    const config = createPinoConfig();
    const redact = (config.pinoHttp as any).redact;
    expect(redact.paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.x-conqr-delegation',
        'headers.authorization',
        'headers.x-conqr-delegation',
      ]),
    );
    expect(redact.censor).toBe('[Redacted]');
  });
});

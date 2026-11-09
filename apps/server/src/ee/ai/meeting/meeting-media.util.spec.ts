import {
  audioResponseHeaders,
  detectAudioContainer,
  playableAudioType,
  storageFileName,
} from './meeting-media.util';

const bytes = (...b: number[]) => Buffer.from(b);
const ascii = (s: string, pad = 16) =>
  Buffer.concat([Buffer.from(s, 'latin1'), Buffer.alloc(pad)]);

describe('detectAudioContainer', () => {
  it.each([
    ['webm', bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0), 'audio/webm'],
    ['ogg', ascii('OggS'), 'audio/ogg'],
    [
      'mp4/m4a',
      Buffer.concat([bytes(0, 0, 0, 0x20), ascii('ftypM4A ')]),
      'audio/mp4',
    ],
    [
      'wav',
      Buffer.concat([ascii('RIFF', 0), bytes(0, 0, 0, 0), ascii('WAVE')]),
      'audio/wav',
    ],
    ['flac', ascii('fLaC'), 'audio/flac'],
    ['mp3 (ID3)', ascii('ID3'), 'audio/mpeg'],
    ['mp3 (frame sync)', bytes(0xff, 0xfb, 0x90, 0x64), 'audio/mpeg'],
    ['aac (ADTS)', bytes(0xff, 0xf1, 0x50, 0x80), 'audio/aac'],
  ])('recognises %s from its bytes', (_name, buf, mime) => {
    expect(detectAudioContainer(buf)?.mime).toBe(mime);
  });

  it.each([
    ['HTML', ascii('<!doctype html><script>alert(1)</script>')],
    ['SVG', ascii('<svg xmlns="http://www.w3.org/2000/svg" onload="x()">')],
    ['PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
    ['PDF', ascii('%PDF-1.7')],
    ['empty', Buffer.alloc(0)],
    ['text', ascii('just some text')],
  ])('refuses %s whatever the client claims', (_name, buf) => {
    expect(detectAudioContainer(buf)).toBeNull();
  });
});

describe('audioResponseHeaders', () => {
  it('serves allow-listed audio inline, sandboxed and unsniffable', () => {
    const h = audioResponseHeaders('audio/webm;codecs=opus');
    expect(h['Content-Type']).toBe('audio/webm');
    expect(h['Content-Disposition']).toBe('inline');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Content-Security-Policy']).toContain('sandbox');
  });

  it('downgrades a legacy client-supplied text/html type to an opaque download', () => {
    const h = audioResponseHeaders('text/html');
    expect(h['Content-Type']).toBe('application/octet-stream');
    expect(h['Content-Disposition']).toBe('attachment');
    expect(h['Content-Security-Policy']).toContain('sandbox');
  });

  it('maps known aliases and refuses image/svg+xml', () => {
    expect(playableAudioType('audio/x-flac')).toBe('audio/flac');
    expect(playableAudioType('video/webm')).toBe('audio/webm');
    expect(playableAudioType('image/svg+xml')).toBeNull();
    expect(playableAudioType(undefined)).toBeNull();
  });
});

describe('storageFileName', () => {
  it('strips paths and unsafe characters and uses the detected extension', () => {
    expect(storageFileName('../../etc/passwd.html', 'webm')).toBe(
      'passwd.webm',
    );
    expect(storageFileName('C:\\x\\Entrevue été 2026.mp3', 'mp3')).toBe(
      'Entrevue-ete-2026.mp3',
    );
    expect(storageFileName('<svg>.svg', 'ogg')).toBe('svg.ogg');
    expect(storageFileName(undefined, 'wav')).toBe('recording.wav');
  });
});

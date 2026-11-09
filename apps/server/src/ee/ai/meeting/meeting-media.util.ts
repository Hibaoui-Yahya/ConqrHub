/**
 * Uploaded meeting media is never trusted by its declared Content-Type or
 * file name: both come from the client. The container is recognised from the
 * file's own leading bytes, and only audio types from a closed list are ever
 * sent back to a browser, so an uploaded HTML/SVG/script file can never be
 * served as active content from a Hub or ConqrMeet origin.
 */

export interface DetectedMedia {
  /** Canonical, parameter-free MIME type. */
  mime: string;
  /** File extension used for the stored object key. */
  ext: string;
}

/** The only Content-Types the audio endpoints will ever emit inline. */
const PLAYABLE_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/flac',
  'audio/aac',
]);

/** Older manifests and recorders spelled some types differently. */
const ALIASES: Record<string, string> = {
  'audio/x-flac': 'audio/flac',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/opus': 'audio/ogg',
  'video/webm': 'audio/webm',
  'video/mp4': 'audio/mp4',
  'video/quicktime': 'audio/mp4',
};

/**
 * Recognises the audio containers ConqrMeet accepts (WebM/Matroska, Ogg,
 * MP4/M4A/MOV, MP3, AAC/ADTS, WAV, FLAC) from their magic bytes. Returns null
 * for anything else, including text, HTML, SVG and images.
 */
export function detectAudioContainer(buf: Buffer): DetectedMedia | null {
  if (!buf || buf.length < 4) return null;
  const at = (offset: number, ascii: string) =>
    buf.length >= offset + ascii.length &&
    buf.toString('latin1', offset, offset + ascii.length) === ascii;

  if (
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  ) {
    return { mime: 'audio/webm', ext: 'webm' };
  }
  if (at(0, 'OggS')) return { mime: 'audio/ogg', ext: 'ogg' };
  if (at(4, 'ftyp')) return { mime: 'audio/mp4', ext: 'm4a' };
  if (at(0, 'RIFF') && at(8, 'WAVE')) return { mime: 'audio/wav', ext: 'wav' };
  if (at(0, 'fLaC')) return { mime: 'audio/flac', ext: 'flac' };
  if (at(0, 'ID3')) return { mime: 'audio/mpeg', ext: 'mp3' };
  if (buf[0] === 0xff) {
    // ADTS AAC: 12-bit sync, layer bits 00.
    if ((buf[1] & 0xf6) === 0xf0) return { mime: 'audio/aac', ext: 'aac' };
    // MPEG audio frame: 11-bit sync, layer bits != 00.
    if ((buf[1] & 0xe0) === 0xe0 && ((buf[1] >> 1) & 0x03) !== 0) {
      return { mime: 'audio/mpeg', ext: 'mp3' };
    }
  }
  return null;
}

/** Normalises a stored or declared type to one of the playable types, or null. */
export function playableAudioType(
  mime: string | null | undefined,
): string | null {
  if (!mime) return null;
  const base = mime.split(';')[0].trim().toLowerCase();
  const canonical = ALIASES[base] ?? base;
  return PLAYABLE_AUDIO_TYPES.has(canonical) ? canonical : null;
}

/**
 * Validity of a signed recording link, in seconds. A signed URL is a bearer
 * pass: whoever holds it reads the audio until it expires, even after their
 * access is gone (Strict Private, phase 0). ConqrMeet's players ask for a
 * new link when this one goes stale.
 */
export const MEETING_AUDIO_URL_TTL_SECONDS = 120;

/**
 * Response headers for streaming stored meeting audio. A type outside the
 * closed list is downgraded to an opaque download. Every response forbids
 * sniffing and runs under a sandboxing CSP, so even a mislabelled file cannot
 * execute script or reach the page's cookies.
 */
export function audioResponseHeaders(
  mime: string | null | undefined,
): Record<string, string> {
  const playable = playableAudioType(mime);
  return {
    'Content-Type': playable ?? 'application/octet-stream',
    'Content-Disposition': playable ? 'inline' : 'attachment',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store',
  };
}

/**
 * A storage-safe file name: no path, only `[A-Za-z0-9._-]`, bounded, with the
 * extension of the detected container (never the client's).
 */
export function storageFileName(
  original: string | undefined,
  ext: string,
): string {
  const base = (original ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80);
  return `${base || 'recording'}.${ext}`;
}

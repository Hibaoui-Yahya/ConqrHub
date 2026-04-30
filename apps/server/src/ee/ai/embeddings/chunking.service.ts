import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

export interface TextChunk {
  chunkIndex: number;
  chunkText: string;
}

@Injectable()
export class ChunkingService {
  /**
   * Split text into overlapping fixed-size chunks.
   * Output is deterministic: same input → same chunks every call.
   */
  chunk(
    text: string,
    opts: { chunkChars?: number; overlap?: number } = {},
  ): TextChunk[] {
    const chunkChars = opts.chunkChars ?? 1600;
    const overlap = Math.min(opts.overlap ?? 200, chunkChars - 1);
    const stride = chunkChars - overlap;

    const trimmed = text.trim();
    if (!trimmed) return [];

    const chunks: TextChunk[] = [];
    let pos = 0;
    let chunkIndex = 0;

    while (pos < trimmed.length) {
      const end = Math.min(pos + chunkChars, trimmed.length);
      const chunkText = trimmed.slice(pos, end).trim();

      if (chunkText) {
        chunks.push({ chunkIndex, chunkText });
        chunkIndex++;
      }

      if (end >= trimmed.length) break;
      pos += stride;
    }

    return chunks;
  }

  /** SHA-256 of the raw text — used to detect unchanged content. */
  contentHash(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }
}

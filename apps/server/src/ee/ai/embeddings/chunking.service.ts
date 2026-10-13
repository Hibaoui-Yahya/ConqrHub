import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

export interface TextChunk {
  chunkIndex: number;
  chunkText: string;
}

const DEFAULT_CHUNK_CHARS = 1200;
const DEFAULT_OVERLAP = 200;

/**
 * One packable unit of text: a sentence, a heading, a list line, or a piece
 * of an over-long sentence that had to be hard-split.
 */
interface Unit {
  text: string;
  /** Separator to put before this unit when it follows another in a chunk. */
  sep: '' | ' ' | '\n' | '\n\n';
  /** True when the unit came out of a hard split and already overlaps its neighbour. */
  hard: boolean;
  /** A heading (or heading-like line): never ends a chunk, never carried over. */
  heading: boolean;
}

// Tokens that end with a period but do not end a sentence (titles, common
// abbreviations in French and English). Compared lowercase, without the dot.
const NON_TERMINAL_ABBREVIATIONS = new Set<string>([
  'm',
  'mme',
  'mlle',
  'mr',
  'mrs',
  'ms',
  'dr',
  'pr',
  'prof',
  'st',
  'ste',
  'no',
  'nos',
  'n°',
  'art',
  'cf',
  'vs',
  'etc',
  'ex',
  'env',
  'approx',
  'inc',
  'ltd',
  'sarl',
  'sas',
  'sa',
  'tel',
  'tél',
  'fig',
  'p',
  'pp',
  'vol',
  'ch',
  'jan',
  'feb',
  'fév',
  'mar',
  'apr',
  'avr',
  'jun',
  'juin',
  'jul',
  'juil',
  'aug',
  'août',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
  'déc',
]);

const MARKDOWN_HEADING = /^#{1,6}\s+\S/u;
const LIST_LINE = /^([-*•]|\d+[.)])\s+\S/u;
const HEADING_LIKE_MAX_CHARS = 80;

/**
 * Plain-text page content has no markdown markers, so a short line without
 * terminal punctuation that is followed by more lines is taken for a heading.
 */
function isHeadingLike(line: string, hasFollowingLine: boolean): boolean {
  if (MARKDOWN_HEADING.test(line)) return true;
  return (
    hasFollowingLine &&
    line.length <= HEADING_LIKE_MAX_CHARS &&
    !LIST_LINE.test(line) &&
    !/[.!?…:;,]$/u.test(line)
  );
}

@Injectable()
export class ChunkingService {
  /**
   * Split text into chunks that respect its structure.
   *
   * Blank lines and headings start new blocks, lines inside a block are cut
   * into sentences, and sentences are packed into chunks of at most
   * `chunkChars` characters. Consecutive chunks overlap by the last one or two
   * sentences of the previous chunk (about `overlap` characters). A chunk
   * boundary never falls inside a word; a single sentence longer than
   * `chunkChars` is hard-split on whitespace with the same overlap.
   *
   * Output is deterministic: same input and options give the same chunks.
   */
  chunk(
    text: string,
    opts: { chunkChars?: number; overlap?: number } = {},
  ): TextChunk[] {
    const chunkChars = Math.max(1, opts.chunkChars ?? DEFAULT_CHUNK_CHARS);
    // Overlap above half a chunk would re-emit most of the previous chunk and,
    // for hard splits, make the stride tiny; clamp it.
    const overlap = Math.max(
      0,
      Math.min(opts.overlap ?? DEFAULT_OVERLAP, Math.floor(chunkChars / 2)),
    );

    const normalized = text.replace(/\r\n?/g, '\n').trim();
    if (!normalized) return [];

    const units = this.toUnits(normalized, chunkChars, overlap);
    return this.pack(units, chunkChars, overlap);
  }

  /** SHA-256 of the raw text — used to detect unchanged content. */
  contentHash(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
  }

  // ---------------------------------------------------------------------------
  // Structure: blocks -> lines -> sentences -> (hard-split) units
  // ---------------------------------------------------------------------------

  private toUnits(text: string, chunkChars: number, overlap: number): Unit[] {
    const units: Unit[] = [];
    const blocks = text.split(/\n[ \t]*\n+/);

    for (const block of blocks) {
      const lines = block
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      lines.forEach((line, idx) => {
        // A markdown heading starts a new block; a heading-like plain line is
        // flagged so the packer never leaves it dangling at a chunk end.
        const isMarkdownHeading = MARKDOWN_HEADING.test(line);
        const heading = isHeadingLike(line, idx < lines.length - 1);
        let lineSep: Unit['sep'] =
          idx === 0 || isMarkdownHeading ? '\n\n' : '\n';
        let firstInLine = true;

        for (const sentence of this.splitSentences(line)) {
          for (const piece of this.hardSplit(sentence, chunkChars, overlap)) {
            units.push({
              text: piece.text,
              sep: units.length === 0 ? '' : lineSep,
              hard: piece.hard,
              heading: heading && firstInLine && !piece.hard,
            });
            lineSep = ' ';
            firstInLine = false;
          }
        }
      });
    }

    return units;
  }

  /**
   * Cut a line into sentences on terminal punctuation followed by whitespace,
   * keeping common abbreviations ("M. Dupont", "etc. ") attached.
   */
  private splitSentences(line: string): string[] {
    const parts = line.split(/(?<=[.!?…])\s+(?=\S)/u);
    const out: string[] = [];

    for (const part of parts) {
      const prev = out[out.length - 1];
      if (prev !== undefined && this.endsWithAbbreviation(prev)) {
        out[out.length - 1] = `${prev} ${part}`;
      } else {
        out.push(part);
      }
    }

    return out.map((s) => s.trim()).filter((s) => s.length > 0);
  }

  private endsWithAbbreviation(sentence: string): boolean {
    const m = /(\S+)\.$/u.exec(sentence);
    if (!m) return false;
    const token = m[1].toLowerCase();
    // Single capital initial ("J. Dupont") or a listed abbreviation.
    if (/^\p{Lu}$/u.test(m[1])) return true;
    return NON_TERMINAL_ABBREVIATIONS.has(token);
  }

  /**
   * A sentence longer than `chunkChars` is cut into windows of at most
   * `chunkChars` with `overlap` characters in common, preferring to cut on
   * whitespace so no word is split. A sentence that fits is returned as is.
   */
  private hardSplit(
    sentence: string,
    chunkChars: number,
    overlap: number,
  ): Array<{ text: string; hard: boolean }> {
    if (sentence.length <= chunkChars) return [{ text: sentence, hard: false }];

    const pieces: Array<{ text: string; hard: boolean }> = [];
    let pos = 0;

    while (pos < sentence.length) {
      let end = Math.min(pos + chunkChars, sentence.length);
      if (end < sentence.length) {
        // Back off to the last whitespace in the second half of the window so
        // the cut lands between words whenever the text has any.
        const window = sentence.slice(pos + Math.floor(chunkChars / 2), end);
        const ws = window.search(/\s\S*$/u);
        if (ws >= 0) end = pos + Math.floor(chunkChars / 2) + ws;
      }

      const piece = sentence.slice(pos, end).trim();
      if (piece) pieces.push({ text: piece, hard: true });
      if (end >= sentence.length) break;

      // Next window starts `overlap` characters before this cut, moved forward
      // to the next word start so the overlap never begins mid-word.
      let next = Math.max(pos + 1, end - overlap);
      if (next < end) {
        const head = sentence.slice(next, end);
        const boundary = head.search(/\s/u);
        if (boundary > 0 && next + boundary + 1 < end) {
          next += boundary + 1;
        } else if (boundary < 0) {
          // No whitespace ahead: step back to the previous word start instead.
          const back = sentence.lastIndexOf(' ', next);
          if (back > pos) next = back + 1;
        }
      }
      pos = next;
    }

    return pieces;
  }

  // ---------------------------------------------------------------------------
  // Packing with sentence overlap
  // ---------------------------------------------------------------------------

  private pack(
    units: Unit[],
    chunkChars: number,
    overlap: number,
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    let cur: Unit[] = [];
    let curLen = 0;

    const emit = () => {
      const textOut = this.render(cur);
      if (textOut)
        chunks.push({ chunkIndex: chunks.length, chunkText: textOut });
    };

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      const next = units[i + 1];
      const sepLen = cur.length === 0 ? 0 : unit.sep.length;
      let needed = sepLen + unit.text.length;
      // A heading must bring at least its first line into the same chunk.
      if (unit.heading && next) needed += next.sep.length + next.text.length;

      if (cur.length > 0 && curLen + needed > chunkChars) {
        emit();
        // A heading is a natural boundary: nothing is carried across it.
        cur = unit.heading ? [] : this.pickCarry(cur, overlap);
        curLen = this.render(cur).length;
        // The carried sentences must still leave room for the new one.
        if (
          cur.length > 0 &&
          curLen + unit.sep.length + unit.text.length > chunkChars
        ) {
          cur = [];
          curLen = 0;
        }
      }
      curLen += (cur.length === 0 ? 0 : unit.sep.length) + unit.text.length;
      cur.push(unit);
    }

    if (cur.length > 0) emit();
    return chunks;
  }

  /**
   * The last one or two units of a chunk that fit within `overlap` chars, to
   * seed the next chunk. Hard-split pieces already overlap their neighbour, so
   * nothing is carried after them. Never carries a whole chunk.
   */
  private pickCarry(cur: Unit[], overlap: number): Unit[] {
    if (overlap <= 0 || cur.length < 2) return [];
    const last = cur[cur.length - 1];
    if (last.hard || last.heading) return [];

    const prev = cur[cur.length - 2];
    const twoLen = prev.text.length + last.sep.length + last.text.length;
    if (!prev.hard && !prev.heading && cur.length > 2 && twoLen <= overlap) {
      return [prev, last];
    }
    if (last.text.length <= overlap) return [last];
    return [];
  }

  private render(units: Unit[]): string {
    let out = '';
    for (let i = 0; i < units.length; i++) {
      out += i === 0 ? units[i].text : units[i].sep + units[i].text;
    }
    return out.trim();
  }
}

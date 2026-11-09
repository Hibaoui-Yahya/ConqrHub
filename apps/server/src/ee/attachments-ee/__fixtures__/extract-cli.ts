/**
 * Test helper: runs the native extractor in a plain Node process, where the
 * pdfjs ESM build loads exactly as in production (Jest's VM cannot import it).
 * Usage: node --import tsx extract-cli.ts <kind> <file> [<kind> <file> ...]
 */
import { readFileSync } from 'node:fs';
import {
  AttachmentKind,
  extractNativeText,
} from '../attachment-text-extractor';

async function main() {
  const args = process.argv.slice(2);
  const results = [];
  for (let i = 0; i + 1 < args.length; i += 2) {
    results.push(
      await extractNativeText(
        readFileSync(args[i + 1]),
        args[i] as AttachmentKind,
      ),
    );
  }
  process.stdout.write(JSON.stringify(results));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});

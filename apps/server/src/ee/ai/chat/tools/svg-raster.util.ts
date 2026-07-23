import { Logger } from '@nestjs/common';

const logger = new Logger('SvgRaster');

/**
 * Rasterise an SVG (e.g. an Excalidraw/Drawio export) to a PNG buffer so it can
 * be sent to a vision model as a real raster image — vision APIs reject
 * `image/svg+xml`. Uses @resvg/resvg-js (self-contained native rasteriser, no
 * system libs / browser). Returns null on any failure so callers can fall back
 * to returning the SVG source as text.
 *
 * `maxWidth` bounds the output resolution (and therefore payload size); the
 * aspect ratio is preserved. Embedded @font-face fonts in the SVG are honoured;
 * a system fallback font covers text that references an uninstalled family.
 */
export async function rasterizeSvgToPng(
  svg: Buffer | string,
  opts: { maxWidth?: number } = {},
): Promise<Buffer | null> {
  const maxWidth = opts.maxWidth ?? 1400;
  try {
    // Lazy require: keeps the native module off the hot boot path and lets the
    // build succeed even if the optional platform binary is unavailable.
    const { Resvg } = await import('@resvg/resvg-js');
    const input = typeof svg === 'string' ? svg : svg.toString('utf8');
    const resvg = new Resvg(input, {
      fitTo: { mode: 'width', value: maxWidth },
      font: {
        loadSystemFonts: true,
        defaultFontFamily: 'sans-serif',
      },
      background: 'white', // Excalidraw exports are transparent; flatten for legibility
    });
    const png = resvg.render().asPng();
    // A near-empty render (e.g. all-transparent, unresolved fonts) isn't useful.
    if (!png || png.length < 128) return null;
    return Buffer.from(png);
  } catch (err) {
    logger.debug(
      `SVG rasterisation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import { StorageService } from '../../../integrations/storage/storage.service';
import {
  AVATAR_THUMBNAIL_SIZES,
  type AvatarThumbnailSize,
  MAX_THUMBNAIL_SOURCE_BYTES,
  renderAvatarThumbnail,
  thumbnailPath,
} from '../avatar-thumbnail.util';

/** At most this many FFmpeg renders at once, whatever the traffic. */
const MAX_CONCURRENT_RENDERS = 2;

/**
 * Cached avatar thumbnails (LTC-06). The original upload is never changed;
 * a thumbnail is rendered on first request and stored beside it, under the
 * same workspace folder, then served from storage.
 */
@Injectable()
export class AvatarThumbnailService {
  private readonly logger = new Logger(AvatarThumbnailService.name);
  private readonly inFlight = new Map<string, Promise<{ buffer: Buffer; mime: string } | null>>();
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly storage: StorageService) {}

  /**
   * The thumbnail of a stored avatar, or null when it cannot be produced
   * (the caller then serves the original, as before).
   */
  async get(
    originalPath: string,
    size: AvatarThumbnailSize,
  ): Promise<{ stream: Readable; mime: string } | null> {
    for (const ext of ['webp', 'png'] as const) {
      const cached = thumbnailPath(originalPath, size, ext);
      if (await this.storage.exists(cached).catch(() => false)) {
        try {
          return {
            stream: await this.storage.readStream(cached),
            mime: ext === 'webp' ? 'image/webp' : 'image/png',
          };
        } catch {
          // fall through and render again
        }
      }
    }
    const key = `${originalPath}#${size}`;
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.render(originalPath, size).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, pending);
    }
    const rendered = await pending;
    return rendered
      ? { stream: Readable.from(rendered.buffer), mime: rendered.mime }
      : null;
  }

  /** Remove every cached thumbnail of an avatar (photo replaced or removed). */
  async deleteFor(originalPath: string): Promise<void> {
    await Promise.all(
      AVATAR_THUMBNAIL_SIZES.flatMap((size) =>
        (['webp', 'png'] as const).map((ext) =>
          this.storage.delete(thumbnailPath(originalPath, size, ext)).catch(() => undefined),
        ),
      ),
    );
  }

  private async render(
    originalPath: string,
    size: AvatarThumbnailSize,
  ): Promise<{ buffer: Buffer; mime: string } | null> {
    await this.acquire();
    try {
      const original = await this.storage.read(originalPath);
      if (!original?.length || original.length > MAX_THUMBNAIL_SOURCE_BYTES) {
        return null;
      }
      const thumb = await renderAvatarThumbnail(original, size);
      await this.storage
        .upload(thumbnailPath(originalPath, size, thumb.ext), thumb.buffer)
        .catch((err) =>
          this.logger.warn(`Avatar thumbnail not cached: ${(err as Error).message}`),
        );
      return { buffer: thumb.buffer, mime: thumb.mime };
    } catch (err) {
      this.logger.warn(
        `Avatar thumbnail unavailable for ${originalPath}: ${(err as Error).message}`,
      );
      return null;
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < MAX_CONCURRENT_RENDERS) {
      this.running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) =>
      this.waiting.push(() => {
        this.running += 1;
        resolve();
      }),
    );
  }

  private release() {
    this.running -= 1;
    this.waiting.shift()?.();
  }
}

import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import { KyselyDB } from '@docmost/db/types/kysely.types';

export interface ExtractionRow {
  attachmentId: string;
  status: string;
  method: string | null;
  sourceSha256: string | null;
  sourceSize: string | number | null;
  sourceUpdatedAt: Date | null;
  textSha256: string | null;
  pageCount: number | null;
  attempts: number;
  detail: string | null;
  extractorVersion: number;
  updatedAt: Date;
}

export interface ExtractionValues {
  status: string;
  method: string | null;
  sourceSha256: string | null;
  sourceSize: number;
  sourceUpdatedAt: Date;
  textSha256: string | null;
  charCount: number;
  pageCount: number | null;
  ocrPages: number;
  attempts: number;
  lastError: string | null;
  detail: string | null;
  extractorVersion: number;
}

export interface StoreAttachmentRef {
  id: string;
  workspaceId: string;
  updatedAt: Date;
  fileSize: number | string | bigint | null;
}

/**
 * - `written`: text and state stored;
 * - `changed`: the attachment was replaced or deleted meanwhile, nothing stored;
 * - `late`: an OCR result whose claim was taken over, nothing stored;
 * - `busy`: another worker holds a fresh OCR claim, nothing stored.
 */
export type SaveResult = 'written' | 'changed' | 'late' | 'busy';

/**
 * Persistence for AttachmentExtractionService: the attachment_text_extractions
 * row and attachments.text_content.
 */
@Injectable()
export class AttachmentExtractionStore {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  findRow(attachmentId: string): Promise<ExtractionRow | undefined> {
    return this.db
      .selectFrom('attachmentTextExtractions')
      .select([
        'attachmentId',
        'status',
        'method',
        'sourceSha256',
        'sourceSize',
        'sourceUpdatedAt',
        'textSha256',
        'pageCount',
        'attempts',
        'detail',
        'extractorVersion',
        'updatedAt',
      ])
      .where('attachmentId', '=', attachmentId)
      .executeTakeFirst() as Promise<ExtractionRow | undefined>;
  }

  async loadText(attachmentId: string): Promise<string | null> {
    const r = await this.db
      .selectFrom('attachments')
      .select('textContent')
      .where('id', '=', attachmentId)
      .executeTakeFirst();
    return r?.textContent ?? null;
  }

  /**
   * An already-processed attachment with identical bytes in the same
   * workspace. Only complete results are shared (`extracted` / `empty`).
   */
  findDuplicate(
    workspaceId: string,
    sourceSha256: string,
    excludeAttachmentId: string,
    extractorVersion: number,
  ): Promise<
    | {
        status: string;
        method: string | null;
        pageCount: number | null;
        detail: string | null;
        textContent: string | null;
      }
    | undefined
  > {
    return this.db
      .selectFrom('attachmentTextExtractions as e')
      .innerJoin('attachments as a', 'a.id', 'e.attachmentId')
      .select([
        'e.status',
        'e.method',
        'e.pageCount',
        'e.detail',
        'a.textContent',
      ])
      .where('e.workspaceId', '=', workspaceId)
      .where('a.workspaceId', '=', workspaceId)
      .where('a.deletedAt', 'is', null)
      .where('e.sourceSha256', '=', sourceSha256)
      .where('e.extractorVersion', '=', extractorVersion)
      .where('e.status', 'in', ['extracted', 'empty'])
      .where('e.attachmentId', '!=', excludeAttachmentId)
      .limit(1)
      .executeTakeFirst();
  }

  /**
   * Atomically marks the attachment `ocr_running` with a fresh claim token
   * unless another worker holds a fresh claim for the same bytes, so two jobs
   * never pay for the same OCR. Returns the token, or null when busy.
   */
  async claimOcr(
    att: StoreAttachmentRef,
    claim: {
      sourceSha256: string;
      pageCount: number | null;
      extractorVersion: number;
    },
    leaseMs: number,
  ): Promise<string | null> {
    const token = randomUUID();
    const leaseCutoff = new Date(Date.now() - leaseMs);
    const values = {
      status: 'ocr_running',
      sourceSha256: claim.sourceSha256,
      sourceSize: Number(att.fileSize ?? 0),
      sourceUpdatedAt: att.updatedAt,
      pageCount: claim.pageCount,
      extractorVersion: claim.extractorVersion,
      claimToken: token,
    };
    const claimed = await this.db
      .insertInto('attachmentTextExtractions')
      .values({ attachmentId: att.id, workspaceId: att.workspaceId, ...values })
      .onConflict((oc) =>
        oc
          .column('attachmentId')
          .doUpdateSet({ ...values, updatedAt: sql`now()` })
          .where((eb) =>
            eb.or([
              eb('attachmentTextExtractions.status', '!=', 'ocr_running'),
              eb('attachmentTextExtractions.updatedAt', '<', leaseCutoff),
              // A claim on older bytes never blocks the new file.
              eb(
                'attachmentTextExtractions.sourceSha256',
                'is distinct from',
                claim.sourceSha256,
              ),
            ]),
          ),
      )
      .returning('attachmentId')
      .executeTakeFirst();
    return claimed ? token : null;
  }

  /**
   * Writes the text and the extraction row in one transaction, under a row
   * lock, only while:
   * - the attachment still has the bytes that were processed (same
   *   updated_at, not deleted);
   * - for an OCR result, its claim token is still the current one;
   * - for any other write, no other worker holds a fresh OCR claim.
   */
  async save(
    att: StoreAttachmentRef,
    values: ExtractionValues,
    text: string | null,
    opts: { claimToken?: string; leaseMs: number },
  ): Promise<SaveResult> {
    return this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('attachmentTextExtractions')
        .select(['status', 'claimToken', 'updatedAt', 'sourceSha256'])
        .where('attachmentId', '=', att.id)
        .forUpdate()
        .executeTakeFirst();

      if (opts.claimToken) {
        if (!current || current.claimToken !== opts.claimToken) return 'late';
      } else if (
        current?.status === 'ocr_running' &&
        Date.now() - new Date(current.updatedAt).getTime() < opts.leaseMs &&
        // A claim on other (older) bytes does not block the current file.
        (!values.sourceSha256 || current.sourceSha256 === values.sourceSha256)
      ) {
        return 'busy';
      }

      const updated = await trx
        .updateTable('attachments')
        .set({ textContent: text })
        .where('id', '=', att.id)
        .where('deletedAt', 'is', null)
        .where(
          sql<Date>`date_trunc('milliseconds', updated_at)`,
          '=',
          att.updatedAt,
        )
        .executeTakeFirst();
      if (Number(updated.numUpdatedRows ?? 0) === 0) return 'changed';

      const row = { ...values, claimToken: null };
      await trx
        .insertInto('attachmentTextExtractions')
        .values({ attachmentId: att.id, workspaceId: att.workspaceId, ...row })
        .onConflict((oc) =>
          oc
            .column('attachmentId')
            .doUpdateSet({ ...row, updatedAt: sql`now()` }),
        )
        .execute();
      return 'written';
    });
  }
}

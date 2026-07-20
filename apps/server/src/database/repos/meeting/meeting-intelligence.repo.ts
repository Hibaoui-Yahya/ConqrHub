import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  InsertableMeetingActionProposal,
  InsertableMeetingDocument,
  InsertableMeetingProcessingEvent,
  InsertableMeetingTranscript,
  Meeting,
  MeetingActionProposal,
  MeetingDocument,
  MeetingProcessingEvent,
  MeetingTranscript,
  UpdatableMeetingActionProposal,
  UpdatableMeetingDocument,
  UpdatableMeetingTranscript,
} from '@docmost/db/types/entity.types';

/**
 * Data access for the meeting-intelligence tables
 * (transcripts, documents, action proposals, processing events).
 * Everything is scoped through the meeting's workspace by callers
 * (MeetingRepo.findById enforces workspaceId); direct helpers here that
 * take workspaceId re-check it defensively.
 */
@Injectable()
export class MeetingIntelligenceRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  // ---- status (conditional transition) ----

  /**
   * Atomically move a meeting from `fromStatus` to `toStatus`.
   * Returns the updated row, or undefined when the meeting was not in
   * `fromStatus` (someone else transitioned first — callers treat as no-op).
   */
  async transitionStatus(
    meetingId: string,
    workspaceId: string,
    fromStatus: string,
    toStatus: string,
    extra?: Record<string, unknown>,
    trx?: KyselyTransaction,
  ): Promise<Meeting | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('meetings')
      .set({
        status: toStatus as never,
        updatedAt: new Date(),
        ...(extra as object),
      })
      .where('id', '=', meetingId)
      .where('workspaceId', '=', workspaceId)
      .where('status', '=', fromStatus as never)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirst() as Promise<Meeting | undefined>;
  }

  // ---- transcripts ----

  async insertTranscript(
    insertable: InsertableMeetingTranscript,
    trx?: KyselyTransaction,
  ): Promise<MeetingTranscript> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('meetingTranscripts')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateTranscript(
    transcriptId: string,
    updatable: UpdatableMeetingTranscript,
    trx?: KyselyTransaction,
  ): Promise<MeetingTranscript | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('meetingTranscripts')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', transcriptId)
      .returningAll()
      .executeTakeFirst();
  }

  async findTranscript(
    meetingId: string,
    version: number,
  ): Promise<MeetingTranscript | undefined> {
    return this.db
      .selectFrom('meetingTranscripts')
      .selectAll()
      .where('meetingId', '=', meetingId)
      .where('version', '=', version)
      .executeTakeFirst();
  }

  async findLatestTranscript(
    meetingId: string,
    opts?: { kind?: string; status?: string },
  ): Promise<MeetingTranscript | undefined> {
    let q = this.db
      .selectFrom('meetingTranscripts')
      .selectAll()
      .where('meetingId', '=', meetingId);
    if (opts?.kind) q = q.where('kind', '=', opts.kind);
    if (opts?.status) q = q.where('status', '=', opts.status);
    return q.orderBy('version', 'desc').limit(1).executeTakeFirst();
  }

  async listTranscriptVersions(
    meetingId: string,
  ): Promise<
    Pick<
      MeetingTranscript,
      'id' | 'version' | 'kind' | 'status' | 'provider' | 'language' | 'createdAt'
    >[]
  > {
    return this.db
      .selectFrom('meetingTranscripts')
      .select([
        'id',
        'version',
        'kind',
        'status',
        'provider',
        'language',
        'createdAt',
      ])
      .where('meetingId', '=', meetingId)
      .orderBy('version', 'asc')
      .execute();
  }

  async findTranscriptByProviderJobId(
    providerJobId: string,
  ): Promise<MeetingTranscript | undefined> {
    return this.db
      .selectFrom('meetingTranscripts')
      .selectAll()
      .where('providerJobId', '=', providerJobId)
      .executeTakeFirst();
  }

  async nextTranscriptVersion(meetingId: string): Promise<number> {
    const row = await this.db
      .selectFrom('meetingTranscripts')
      .select((eb) => eb.fn.max('version').as('max'))
      .where('meetingId', '=', meetingId)
      .executeTakeFirst();
    return (Number(row?.max) || 0) + 1;
  }

  // ---- documents ----

  async insertDocument(
    insertable: InsertableMeetingDocument,
    trx?: KyselyTransaction,
  ): Promise<MeetingDocument> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('meetingDocuments')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateDocument(
    documentId: string,
    updatable: UpdatableMeetingDocument,
    trx?: KyselyTransaction,
  ): Promise<MeetingDocument | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('meetingDocuments')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', documentId)
      .returningAll()
      .executeTakeFirst();
  }

  async listDocuments(meetingId: string): Promise<MeetingDocument[]> {
    return this.db
      .selectFrom('meetingDocuments')
      .selectAll()
      .where('meetingId', '=', meetingId)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  async findDocument(
    documentId: string,
    meetingId: string,
  ): Promise<MeetingDocument | undefined> {
    return this.db
      .selectFrom('meetingDocuments')
      .selectAll()
      .where('id', '=', documentId)
      .where('meetingId', '=', meetingId)
      .executeTakeFirst();
  }

  async supersedeDocuments(
    meetingId: string,
    keepDocumentIds: string[],
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    let q = db
      .updateTable('meetingDocuments')
      .set({ status: 'superseded', updatedAt: new Date() })
      .where('meetingId', '=', meetingId)
      .where('status', '=', 'generated');
    if (keepDocumentIds.length > 0) {
      q = q.where('id', 'not in', keepDocumentIds);
    }
    await q.execute();
  }

  // ---- proposals ----

  async insertProposal(
    insertable: InsertableMeetingActionProposal,
    trx?: KyselyTransaction,
  ): Promise<MeetingActionProposal | undefined> {
    const db = dbOrTx(this.db, trx);
    // Idempotent: identical proposal (same idempotency key) is not duplicated.
    return db
      .insertInto('meetingActionProposals')
      .values(insertable)
      .onConflict((oc) => oc.column('idempotencyKey').doNothing())
      .returningAll()
      .executeTakeFirst();
  }

  async updateProposal(
    proposalId: string,
    workspaceId: string,
    updatable: UpdatableMeetingActionProposal,
    trx?: KyselyTransaction,
  ): Promise<MeetingActionProposal | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('meetingActionProposals')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', proposalId)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirst();
  }

  /**
   * Atomically move a proposal between statuses (approval/execution races).
   * Returns undefined when the proposal was not in `fromStatus`.
   */
  async transitionProposal(
    proposalId: string,
    workspaceId: string,
    fromStatus: string | string[],
    toStatus: string,
    extra?: UpdatableMeetingActionProposal,
    trx?: KyselyTransaction,
  ): Promise<MeetingActionProposal | undefined> {
    const db = dbOrTx(this.db, trx);
    const from = Array.isArray(fromStatus) ? fromStatus : [fromStatus];
    return db
      .updateTable('meetingActionProposals')
      .set({ status: toStatus, updatedAt: new Date(), ...(extra as object) })
      .where('id', '=', proposalId)
      .where('workspaceId', '=', workspaceId)
      .where('status', 'in', from)
      .returningAll()
      .executeTakeFirst();
  }

  async findProposal(
    proposalId: string,
    workspaceId: string,
  ): Promise<MeetingActionProposal | undefined> {
    return this.db
      .selectFrom('meetingActionProposals')
      .selectAll()
      .where('id', '=', proposalId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async listProposals(
    meetingId: string,
    workspaceId: string,
  ): Promise<MeetingActionProposal[]> {
    return this.db
      .selectFrom('meetingActionProposals')
      .selectAll()
      .where('meetingId', '=', meetingId)
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  // ---- processing events ----

  async insertEvent(
    insertable: InsertableMeetingProcessingEvent,
    trx?: KyselyTransaction,
  ): Promise<MeetingProcessingEvent> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('meetingProcessingEvents')
      .values(insertable)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async listEvents(
    meetingId: string,
    limit = 100,
  ): Promise<MeetingProcessingEvent[]> {
    return this.db
      .selectFrom('meetingProcessingEvents')
      .selectAll()
      .where('meetingId', '=', meetingId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
  }

  // ---- duplicate upload detection ----

  async findMeetingByContentHash(
    workspaceId: string,
    sha256: string,
  ): Promise<{ id: string } | undefined> {
    return this.db
      .selectFrom('meetings')
      .select(['id'])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where(
        sql<boolean>`audio_manifest -> 'original' ->> 'sha256' = ${sha256}`,
      )
      .executeTakeFirst();
  }
}

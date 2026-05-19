import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  Meeting,
  InsertableMeeting,
  UpdatableMeeting,
  MeetingSegment,
  InsertableMeetingSegment,
} from '@docmost/db/types/entity.types';

@Injectable()
export class MeetingRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields = [
    'id',
    'workspaceId',
    'userId',
    'title',
    'status',
    'transcript',
    'startedAt',
    'endedAt',
    'durationMs',
    'settings',
    'aiOutputs',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ] as const;

  async findById(
    meetingId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Meeting | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('meetings')
      .select(this.baseFields)
      .where('id', '=', meetingId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async listByUser(
    workspaceId: string,
    userId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ items: Meeting[]; total: number }> {
    const items = await this.db
      .selectFrom('meetings')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId)
      .where('userId', '=', userId)
      .where('deletedAt', 'is', null)
      .orderBy('startedAt', 'desc')
      .limit(opts.limit)
      .offset(opts.offset)
      .execute();

    const { count } = (await this.db
      .selectFrom('meetings')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('userId', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst()) ?? { count: 0 };

    return { items, total: Number(count) };
  }

  async insert(
    insertable: InsertableMeeting,
    trx?: KyselyTransaction,
  ): Promise<Meeting> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('meetings')
      .values(insertable)
      .returning(this.baseFields)
      .executeTakeFirstOrThrow();
  }

  async update(
    meetingId: string,
    workspaceId: string,
    updatable: UpdatableMeeting,
    trx?: KyselyTransaction,
  ): Promise<Meeting | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('meetings')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', meetingId)
      .where('workspaceId', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async softDelete(
    meetingId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('meetings')
      .set({ deletedAt: new Date() })
      .where('id', '=', meetingId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async insertSegment(
    segment: InsertableMeetingSegment,
    trx?: KyselyTransaction,
  ): Promise<MeetingSegment> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('meetingSegments')
      .values(segment)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async listSegments(
    meetingId: string,
    trx?: KyselyTransaction,
  ): Promise<MeetingSegment[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('meetingSegments')
      .selectAll()
      .where('meetingId', '=', meetingId)
      .orderBy('startMs', 'asc')
      .orderBy('source', 'asc')
      .execute();
  }
}

import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import { AiChat, InsertableAiChat, UpdatableAiChat } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { KyselyTransaction } from '@docmost/db/types/kysely.types';

@Injectable()
export class AiChatRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof AiChat> = [
    'id',
    'workspaceId',
    'creatorId',
    'title',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async findById(
    chatId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<AiChat | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('aiChats')
      .select(this.baseFields)
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async insert(
    insertable: InsertableAiChat,
    trx?: KyselyTransaction,
  ): Promise<AiChat> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('aiChats')
      .values(insertable)
      .returning(this.baseFields)
      .executeTakeFirstOrThrow();
  }

  async update(
    chatId: string,
    workspaceId: string,
    updatable: UpdatableAiChat,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('aiChats')
      .set({ ...updatable, updatedAt: new Date() })
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async softDelete(
    chatId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('aiChats')
      .set({ deletedAt: new Date() })
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async listByCreator(
    creatorId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    const query = this.db
      .selectFrom('aiChats')
      .select(this.baseFields)
      .where('creatorId', '=', creatorId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null);

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      fields: [{ expression: 'id', direction: 'desc' }],
      parseCursor: (c) => ({ id: c.id }),
    });
  }

  async hasTitleSet(chatId: string, workspaceId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('aiChats')
      .select('title')
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return !!row?.title;
  }
}

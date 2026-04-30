import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { dbOrTx } from '@docmost/db/utils';
import {
  AiChatMessage,
  InsertableAiChatMessage,
} from '@docmost/db/types/entity.types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsquery = require('pg-tsquery')();

@Injectable()
export class AiChatMessageRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private baseFields: Array<keyof AiChatMessage> = [
    'id',
    'chatId',
    'workspaceId',
    'userId',
    'role',
    'content',
    'toolCalls',
    'metadata',
    'confidence',
    'groundedSourceCount',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ];

  async insert(
    insertable: InsertableAiChatMessage,
    trx?: KyselyTransaction,
  ): Promise<AiChatMessage> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('aiChatMessages')
      .values(insertable)
      .returning(this.baseFields)
      .executeTakeFirstOrThrow();
  }

  async listByChat(
    chatId: string,
    workspaceId: string,
  ): Promise<AiChatMessage[]> {
    return this.db
      .selectFrom('aiChatMessages')
      .select(this.baseFields)
      .where('chatId', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  async countByChat(chatId: string, workspaceId: string): Promise<number> {
    const row = await this.db
      .selectFrom('aiChatMessages')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('chatId', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  async searchByWorkspace(
    workspaceId: string,
    creatorId: string,
    rawQuery: string,
  ): Promise<AiChatMessage[]> {
    if (!rawQuery.trim()) return [];
    const searchQuery = tsquery(rawQuery.trim() + '*');
    return this.db
      .selectFrom('aiChatMessages')
      .select(this.baseFields)
      .where('workspaceId', '=', workspaceId)
      .where('userId', '=', creatorId)
      .where('deletedAt', 'is', null)
      .where(
        'tsv',
        '@@',
        sql<string>`to_tsquery('english', f_unaccent(${searchQuery}))`,
      )
      .orderBy('createdAt', 'desc')
      .limit(20)
      .execute();
  }
}

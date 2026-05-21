import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import {
  Comment,
  InsertableComment,
  UpdatableComment,
} from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { ExpressionBuilder } from 'kysely';
import { DB } from '@docmost/db/types/db';
import { jsonObjectFrom } from 'kysely/helpers/postgres';

@Injectable()
export class CommentRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(
    commentId: string,
    workspaceId: string,
    opts?: { includeCreator: boolean; includeResolvedBy: boolean },
  ): Promise<Comment> {
    return await this.db
      .selectFrom('comments')
      .selectAll('comments')
      .$if(opts?.includeCreator, (qb) => qb.select(this.withCreator))
      .$if(opts?.includeResolvedBy, (qb) => qb.select(this.withResolvedBy))
      .where('id', '=', commentId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async findPageComments(
    pageId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    const query = this.db
      .selectFrom('comments')
      .selectAll('comments')
      .select((eb) => this.withCreator(eb))
      .select((eb) => this.withResolvedBy(eb))
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId);

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'id', direction: 'asc' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  async updateComment(
    updatableComment: UpdatableComment,
    commentId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('comments')
      .set(updatableComment)
      .where('id', '=', commentId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async insertComment(
    insertableComment: InsertableComment,
    trx?: KyselyTransaction,
  ): Promise<Comment> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('comments')
      .values(insertableComment)
      .returningAll()
      .executeTakeFirst();
  }

  withCreator(eb: ExpressionBuilder<DB, 'comments'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'comments.creatorId'),
    ).as('creator');
  }

  withResolvedBy(eb: ExpressionBuilder<DB, 'comments'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'comments.resolvedById'),
    ).as('resolvedBy');
  }

  async deleteComment(commentId: string, workspaceId: string): Promise<void> {
    await this.db
      .deleteFrom('comments')
      .where('id', '=', commentId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async hasChildren(commentId: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('comments')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('parentCommentId', '=', commentId)
      .executeTakeFirst();

    return Number(result?.count) > 0;
  }

  async hasChildrenFromOtherUsers(commentId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .selectFrom('comments')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('parentCommentId', '=', commentId)
      .where('creatorId', '!=', userId)
      .executeTakeFirst();

    return Number(result?.count) > 0;
  }
}

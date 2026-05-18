import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { InsertableApiKey } from '@docmost/db/types/entity.types';

@Injectable()
export class ApiKeyRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(id: string, workspaceId: string) {
    return (this.db as any)
      .selectFrom('apiKeys')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByWorkspaceId(
    workspaceId: string,
    opts: { cursor?: string; limit?: number; creatorId?: string },
  ) {
    let query = (this.db as any)
      .selectFrom('apiKeys')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null);

    if (opts.creatorId) {
      query = query.where('creatorId', '=', opts.creatorId);
    }

    if (opts.cursor) {
      query = query.where('id', '>', opts.cursor);
    }

    return query
      .orderBy('createdAt', 'desc')
      .limit(opts.limit ?? 20)
      .execute();
  }

  async insert(data: InsertableApiKey) {
    const [row] = await (this.db as any)
      .insertInto('apiKeys')
      .values(data)
      .returningAll()
      .execute();
    return row;
  }

  async update(id: string, workspaceId: string, data: { name?: string; lastUsedAt?: Date }) {
    return (this.db as any)
      .updateTable('apiKeys')
      .set(data)
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
  }

  async revoke(id: string, workspaceId: string) {
    return (this.db as any)
      .updateTable('apiKeys')
      .set({ deletedAt: sql`now()` })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
  }
}

import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  InsertableMcpOauthClient,
  McpOauthClient,
} from '@docmost/db/types/entity.types';

@Injectable()
export class McpOauthClientRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insert(data: InsertableMcpOauthClient): Promise<McpOauthClient> {
    const [row] = await this.db
      .insertInto('mcpOauthClients')
      .values(data)
      .returningAll()
      .execute();
    return row as McpOauthClient;
  }

  async findByClientId(clientId: string): Promise<McpOauthClient | undefined> {
    return this.db
      .selectFrom('mcpOauthClients')
      .selectAll()
      .where('clientId', '=', clientId)
      .executeTakeFirst() as Promise<McpOauthClient | undefined>;
  }
}

import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  InsertableMcpOauthRefreshToken,
  McpOauthRefreshToken,
} from '@docmost/db/types/entity.types';
import { sql } from 'kysely';

@Injectable()
export class McpOauthRefreshTokenRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async insert(
    data: InsertableMcpOauthRefreshToken,
  ): Promise<McpOauthRefreshToken> {
    const [row] = await this.db
      .insertInto('mcpOauthRefreshTokens')
      .values(data)
      .returningAll()
      .execute();
    return row as McpOauthRefreshToken;
  }

  async findByHash(
    tokenHash: string,
  ): Promise<McpOauthRefreshToken | undefined> {
    return this.db
      .selectFrom('mcpOauthRefreshTokens')
      .selectAll()
      .where('tokenHash', '=', tokenHash)
      .executeTakeFirst() as Promise<McpOauthRefreshToken | undefined>;
  }

  /** Mark a token rotated (single-use). Returns rows affected. */
  async markRotated(id: string): Promise<number> {
    const res = await this.db
      .updateTable('mcpOauthRefreshTokens')
      .set({ rotatedAt: sql`now()` })
      .where('id', '=', id)
      .where('rotatedAt', 'is', null)
      .executeTakeFirst();
    return Number(res.numUpdatedRows ?? 0);
  }

  /**
   * Delete every refresh token for a grant. Used both when revoking a grant
   * and when refresh-token reuse is detected (revoke the whole chain).
   */
  async deleteByApiKeyId(apiKeyId: string): Promise<void> {
    await this.db
      .deleteFrom('mcpOauthRefreshTokens')
      .where('apiKeyId', '=', apiKeyId)
      .execute();
  }
}

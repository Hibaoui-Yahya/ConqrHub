import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { ExpressionBuilder, SelectQueryBuilder } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { DB } from '@docmost/db/types/db';
import {
  InsertableTemplate,
  Template,
  UpdatableTemplate,
} from '@docmost/db/types/entity.types';
import { executeWithCursorPagination } from '@docmost/db/pagination/cursor-pagination';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';

/** Columns sent to the client (never the Yjs state or the search vector). */
const BASE_COLUMNS = [
  'templates.id',
  'templates.title',
  'templates.description',
  'templates.icon',
  'templates.spaceId',
  'templates.workspaceId',
  'templates.creatorId',
  'templates.lastUpdatedById',
  'templates.createdAt',
  'templates.updatedAt',
] as const;

@Injectable()
export class TemplateRepo {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  private withCreator(eb: ExpressionBuilder<DB, 'templates'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'templates.creatorId'),
    ).as('creator');
  }

  async findById(
    templateId: string,
    workspaceId: string,
    opts: { includeContent?: boolean } = {},
  ): Promise<(Template & { creator?: unknown }) | undefined> {
    let query = this.db
      .selectFrom('templates')
      .select(BASE_COLUMNS)
      .select((eb) => this.withCreator(eb))
      .where('templates.id', '=', templateId)
      .where('templates.workspaceId', '=', workspaceId)
      .where('templates.deletedAt', 'is', null);
    if (opts.includeContent) {
      query = query.select('templates.content');
    }
    return query.executeTakeFirst() as Promise<any>;
  }

  /**
   * Templates a member can see: the company-wide ones and those of the
   * spaces they belong to. `spaceId` narrows to one space.
   */
  async list(opts: {
    userId: string;
    workspaceId: string;
    spaceId?: string;
    query?: string;
    limit: number;
    cursor?: string;
    beforeCursor?: string;
  }) {
    let query: SelectQueryBuilder<DB, 'templates', any> = this.db
      .selectFrom('templates')
      .select(BASE_COLUMNS)
      .select((eb) => this.withCreator(eb))
      .where('templates.workspaceId', '=', opts.workspaceId)
      .where('templates.deletedAt', 'is', null);

    if (opts.spaceId) {
      query = query.where('templates.spaceId', '=', opts.spaceId);
    } else {
      query = query.where((eb) =>
        eb.or([
          eb('templates.spaceId', 'is', null),
          eb(
            'templates.spaceId',
            'in',
            this.spaceMemberRepo.getUserSpaceIdsQuery(opts.userId),
          ),
        ]),
      );
    }

    const needle = opts.query?.trim();
    if (needle) {
      const pattern = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query = query.where('templates.title', 'ilike', pattern);
    }

    return executeWithCursorPagination(query, {
      perPage: opts.limit,
      cursor: opts.cursor,
      beforeCursor: opts.beforeCursor,
      fields: [{ expression: 'templates.id', direction: 'desc', key: 'id' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  async insert(values: InsertableTemplate): Promise<Template> {
    return this.db
      .insertInto('templates')
      .values(values)
      .returning(BASE_COLUMNS)
      .executeTakeFirst() as Promise<any>;
  }

  async update(
    templateId: string,
    workspaceId: string,
    values: UpdatableTemplate,
  ): Promise<void> {
    await this.db
      .updateTable('templates')
      .set(values)
      .where('id', '=', templateId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
  }

  async softDelete(templateId: string, workspaceId: string): Promise<void> {
    const now = new Date();
    await this.db
      .updateTable('templates')
      .set({ deletedAt: now, updatedAt: now })
      .where('id', '=', templateId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();
  }
}

import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import {
  InsertableWorkspace,
  UpdatableWorkspace,
  Workspace,
} from '@docmost/db/types/entity.types';
import { ExpressionBuilder, sql } from 'kysely';
import { DB, Workspaces } from '@docmost/db/types/db';

@Injectable()
export class WorkspaceRepo {
  public baseFields: Array<keyof Workspaces> = [
    'id',
    'name',
    'description',
    'logo',
    'hostname',
    'customDomain',
    'settings',
    'defaultRole',
    'emailDomains',
    'defaultSpaceId',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'stripeCustomerId',
    'status',
    'billingEmail',
    'trialEndAt',
    'enforceSso',
    'plan',
    'enforceMfa',
    'trashRetentionDays',
  ];
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(
    workspaceId: string,
    opts?: {
      withLock?: boolean;
      withMemberCount?: boolean;
      withLicenseKey?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<Workspace> {
    const db = dbOrTx(this.db, opts?.trx);

    let query = db
      .selectFrom('workspaces')
      .select(this.baseFields)
      .where('id', '=', workspaceId);

    if (opts?.withMemberCount) {
      query = query.select(this.withMemberCount);
    }

    if (opts?.withLicenseKey) {
      query = query.select('licenseKey');
    }

    if (opts?.withLock && opts?.trx) {
      query = query.forUpdate();
    }

    return query.executeTakeFirst();
  }

  async findLicenseKeyById(
    workspaceId: string,
  ): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('workspaces')
      .select('licenseKey')
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    return row?.licenseKey;
  }

  async findFirst(): Promise<Workspace> {
    return await this.db
      .selectFrom('workspaces')
      .selectAll()
      .orderBy('createdAt', 'asc')
      .limit(1)
      .executeTakeFirst();
  }

  async findByHostname(hostname: string): Promise<Workspace> {
    return await this.db
      .selectFrom('workspaces')
      .selectAll()
      .where(sql`LOWER(hostname)`, '=', sql`LOWER(${hostname})`)
      .executeTakeFirst();
  }

  async hostnameExists(
    hostname: string,
    trx?: KyselyTransaction,
  ): Promise<boolean> {
    if (hostname?.length < 1) return false;

    const db = dbOrTx(this.db, trx);
    let { count } = await db
      .selectFrom('workspaces')
      .select((eb) => eb.fn.count('id').as('count'))
      .where(sql`LOWER(hostname)`, '=', sql`LOWER(${hostname})`)
      .executeTakeFirst();
    count = count as number;
    return count != 0;
  }

  async updateWorkspace(
    updatableWorkspace: UpdatableWorkspace,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Workspace> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('workspaces')
      .set({ ...updatableWorkspace, updatedAt: new Date() })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async insertWorkspace(
    insertableWorkspace: InsertableWorkspace,
    trx?: KyselyTransaction,
  ): Promise<Workspace> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('workspaces')
      .values(insertableWorkspace)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async count(): Promise<number> {
    const { count } = await this.db
      .selectFrom('workspaces')
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();
    return count as number;
  }

  withMemberCount(eb: ExpressionBuilder<DB, 'workspaces'>) {
    return eb
      .selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('users.deactivatedAt', 'is', null)
      .where('users.deletedAt', 'is', null)
      .whereRef('users.workspaceId', '=', 'workspaces.id')
      .as('memberCount');
  }

  async getActiveUserCount(workspaceId: string): Promise<number> {
    // Push the active-user filter into SQL — the previous implementation
    // streamed every user row in the workspace back to Node and filtered
    // in JS, which on a large workspace allocated megabytes per call and
    // wasted a round-trip per row scanned.
    const row = await this.db
      .selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  /**
   * Per-key setters for settings.* — replaces the old generic
   * updateApiSettings/updateAiSettings/etc. methods that interpolated a
   * caller-supplied string as a SQL identifier via sql.raw(). One method
   * per allowed (section, key) tuple — no string parameter survives to
   * the SQL layer.
   */
  private updateSettingsSection<TValue extends string | boolean>(
    workspaceId: string,
    section: string,
    key: string,
    value: TValue,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object(${sql.lit(section)}, COALESCE(settings->${sql.lit(section)}, '{}'::jsonb)
                || jsonb_build_object(${sql.lit(key)}, ${sql.lit(value)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  // api.*
  setApiRestrictToAdmins(
    workspaceId: string,
    value: boolean,
    trx?: KyselyTransaction,
  ) {
    return this.updateSettingsSection(
      workspaceId,
      'api',
      'restrictToAdmins',
      value,
      trx,
    );
  }

  // ai.*
  setAiSearch(
    workspaceId: string,
    value: boolean,
    trx?: KyselyTransaction,
  ) {
    return this.updateSettingsSection(workspaceId, 'ai', 'search', value, trx);
  }

  setAiGenerative(
    workspaceId: string,
    value: boolean,
    trx?: KyselyTransaction,
  ) {
    return this.updateSettingsSection(
      workspaceId,
      'ai',
      'generative',
      value,
      trx,
    );
  }

  setAiMcp(workspaceId: string, value: boolean, trx?: KyselyTransaction) {
    return this.updateSettingsSection(workspaceId, 'ai', 'mcp', value, trx);
  }

  setAiChat(workspaceId: string, value: boolean, trx?: KyselyTransaction) {
    return this.updateSettingsSection(workspaceId, 'ai', 'chat', value, trx);
  }

  setAiStt(workspaceId: string, value: boolean, trx?: KyselyTransaction) {
    return this.updateSettingsSection(workspaceId, 'ai', 'stt', value, trx);
  }

  setAiMeeting(
    workspaceId: string,
    value: boolean,
    trx?: KyselyTransaction,
  ) {
    return this.updateSettingsSection(workspaceId, 'ai', 'meeting', value, trx);
  }

  // sharing.*
  setSharingDisabled(
    workspaceId: string,
    value: boolean,
    trx?: KyselyTransaction,
  ) {
    return this.updateSettingsSection(
      workspaceId,
      'sharing',
      'disabled',
      value,
      trx,
    );
  }

  // templates.*
  setAllowMemberTemplates(
    workspaceId: string,
    value: boolean,
    trx?: KyselyTransaction,
  ) {
    return this.updateSettingsSection(
      workspaceId,
      'templates',
      'allowMemberTemplates',
      value,
      trx,
    );
  }
}

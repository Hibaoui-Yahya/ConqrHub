/**
 * ConqrHub — Conqr platform integration.
 *
 * Conqr tenant → ConqrHub workspace.
 *
 * The platform knows about tenants. This product knows about workspaces. Something has to say
 * which is which, and that something is a row somebody created deliberately — not a lookup by
 * name, not a slug convention, and not a workspace conjured during a login.
 *
 * **A binding is never created implicitly.** A person can be perfectly entitled to a tenant that
 * nothing in this product has been bound to, and the answer is a refusal. Creating a workspace on
 * the fly would produce one with no owner, no audit record and nobody who decided it should exist,
 * and it would do so at exactly the moment nobody is watching: somebody's first login.
 *
 * **Resolution never widens.** It matches on the tenant *and* the application id, and only live
 * bindings. A binding for another application, or a retired one, resolves to nothing.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import type { Kysely } from 'kysely';

export interface TenantBinding {
  id: string;
  conqrTenantId: string;
  applicationId: string;
  workspaceId: string;
  status: string;
  revision: number;
}

/**
 * A row as this application's Kysely returns it — **camelCase**, because the connection is built
 * with `CamelCasePlugin` (database.module.ts). That is not a detail: written as snake_case, every
 * field read here came back `undefined`, and because `resolve` still returned an object, a login
 * passed the "is this tenant bound?" check and then provisioned the person into workspace
 * `undefined`. The binding was being ignored while appearing to work.
 */
interface BindingRow {
  id: string;
  conqrTenantId: string;
  applicationId: string;
  workspaceId: string;
  status: string;
  revision: string | number;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantBindingService {
  private readonly logger = new Logger(TenantBindingService.name);

  constructor(@InjectKysely() private readonly db: Kysely<any>) {}

  private static toBinding(row: BindingRow): TenantBinding {
    return {
      id: row.id,
      conqrTenantId: row.conqrTenantId,
      applicationId: row.applicationId,
      workspaceId: row.workspaceId,
      status: row.status,
      revision: Number(row.revision),
    };
  }

  /**
   * The workspace this Conqr tenant is bound to for this application, or `undefined`.
   *
   * `undefined` is a refusal the caller must honour. It is deliberately not an error here, because
   * "this tenant is not set up for ConqrHub yet" is an ordinary operational state with a sensible
   * message, not an exception.
   */
  async resolve(conqrTenantId: string, applicationId: string): Promise<TenantBinding | undefined> {
    const row = (await this.db
      .selectFrom('platform_tenant_bindings')
      .selectAll()
      .where('conqr_tenant_id', '=', conqrTenantId)
      .where('application_id', '=', applicationId)
      .where('status', '=', 'active')
      .executeTakeFirst()) as BindingRow | undefined;
    return row ? TenantBindingService.toBinding(row) : undefined;
  }

  /**
   * Every binding, live and retired, oldest first.
   *
   * It exists because the operator command was doing this query itself, and drifted exactly
   * the way this file warns a second copy will: it read snake_case columns from a connection
   * that camelCases them, so it printed `undefined → undefined` for every row. Reading rows is
   * part of knowing what a binding is, so it belongs here with the rest of that knowledge.
   */
  async list(): Promise<TenantBinding[]> {
    const rows = (await this.db
      .selectFrom('platform_tenant_bindings')
      .selectAll()
      .orderBy('created_at')
      .execute()) as BindingRow[];
    return rows.map(TenantBindingService.toBinding);
  }

  /**
   * Bind a Conqr tenant to an existing workspace.
   *
   * Refuses rather than overwriting. Re-binding a tenant to a different workspace, or a workspace
   * to a different tenant, is the kind of change that silently moves everybody's data; it has to be
   * done by retiring the old binding explicitly so that the act is visible.
   */
  async bind(input: {
    conqrTenantId: string;
    applicationId: string;
    workspaceId: string;
    /** A ConqrHub user id, or nothing. The column references users.id. */
    createdBy?: string | undefined;
  }): Promise<TenantBinding> {
    // Refused here rather than at the database, which reports it as "invalid input syntax for type
    // uuid" — a message about a column, from a layer that cannot say which argument was wrong.
    if (input.createdBy !== undefined && !UUID.test(input.createdBy)) {
      throw new BadRequestException(
        `createdBy must be a ConqrHub user id; got "${input.createdBy}"`,
      );
    }
    const workspace = await this.db
      .selectFrom('workspaces')
      .select(['id'])
      .where('id', '=', input.workspaceId)
      .executeTakeFirst();
    if (!workspace) {
      throw new NotFoundException(`workspace ${input.workspaceId} does not exist`);
    }

    const existing = await this.resolve(input.conqrTenantId, input.applicationId);
    if (existing) {
      if (existing.workspaceId === input.workspaceId) return existing; // idempotent
      throw new ConflictException(
        `tenant ${input.conqrTenantId} is already bound to workspace ${existing.workspaceId} ` +
          'for this application; retire that binding before creating another',
      );
    }

    const boundElsewhere = (await this.db
      .selectFrom('platform_tenant_bindings')
      .selectAll()
      .where('workspace_id', '=', input.workspaceId)
      .where('status', '=', 'active')
      .executeTakeFirst()) as BindingRow | undefined;
    if (boundElsewhere) {
      throw new ConflictException(
        `workspace ${input.workspaceId} is already bound to tenant ${boundElsewhere.conqrTenantId}`,
      );
    }

    const row = (await this.db
      .insertInto('platform_tenant_bindings')
      .values({
        conqr_tenant_id: input.conqrTenantId,
        application_id: input.applicationId,
        workspace_id: input.workspaceId,
        status: 'active',
        revision: 1,
        created_by: input.createdBy ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow()) as BindingRow;

    this.logger.log(
      `bound ${input.conqrTenantId} → workspace ${input.workspaceId} (${input.applicationId})`,
    );
    return TenantBindingService.toBinding(row);
  }

  /** Retire a binding. The workspace and its content are untouched; only the mapping stops. */
  async retire(conqrTenantId: string, applicationId: string): Promise<void> {
    await this.db
      .updateTable('platform_tenant_bindings')
      .set({ status: 'retired', updated_at: new Date() })
      .where('conqr_tenant_id', '=', conqrTenantId)
      .where('application_id', '=', applicationId)
      .where('status', '=', 'active')
      .execute();
    this.logger.log(`retired the binding for ${conqrTenantId} (${applicationId})`);
  }
}

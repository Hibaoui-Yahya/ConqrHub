/**
 * ConqrHub — Conqr platform integration.
 *
 * Bind a Conqr tenant to a ConqrHub workspace, from an operator's shell.
 *
 * **Why this exists.** `TenantBindingService` could create a binding and nothing could call it.
 * No controller, no command, no seed — so `platform_tenant_bindings` had no creation path outside
 * hand-written SQL, and ConqrHub in platform mode refused every login with `tenant_not_bound`
 * with no supported way to fix it. The enforcement half was complete and inert.
 *
 * This is the same gap the platform had for `application_installation`, closed the same way: an
 * operator-only path, not a public API.
 *
 * **Why a command and not a route.** A binding decides which tenant's people reach which
 * workspace's content, so it is the most consequential row in the integration. ConqrHub has no
 * service-assertion guard, so an HTTP route would have to invent an operator authentication story,
 * and the grant-authority invariant that would bound a tenant-admin-facing version is designed and
 * unimplemented. Shell access to the server is an authorization boundary that already exists and
 * is already audited. When that invariant lands, a route can replace this — the refusals live in
 * `TenantBindingService.bind`, not here, so nothing has to be rewritten to move it.
 *
 * It creates no workspace. The workspace must already exist, and `bind` refuses if it does not.
 * Conjuring one here would produce a workspace nobody decided to create, which is precisely what
 * `tenant-binding.service.ts` exists to prevent.
 *
 *   npx tsx src/core/platform/bind-tenant.ts <conqr-tenant-urn> <workspace-id> [application-id]
 *   npx tsx src/core/platform/bind-tenant.ts --list
 *   npx tsx src/core/platform/bind-tenant.ts --retire <conqr-tenant-urn> [application-id]
 *
 * Run from `apps/server`, with the same DATABASE_URL the server uses.
 */
import * as dotenv from 'dotenv';
import { CamelCasePlugin, Kysely } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import postgres from 'postgres';
import { envPath, normalizePostgresUrl } from '../../common/helpers';
import { TenantBindingService } from './tenant-binding.service';

dotenv.config({ path: envPath });

const DEFAULT_APPLICATION = process.env.CONQR_APPLICATION_ID ?? 'conqrhub';

/** The URN shape ConqrAccess issues. Catching a slug here saves a binding nothing resolves. */
const TENANT_URN = /^conqr:tenant:[0-9A-HJKMNP-TV-Z]{26}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usage(message?: string): never {
  if (message) console.error(`error: ${message}\n`);
  console.error(
    [
      'Bind a Conqr tenant to an existing ConqrHub workspace.',
      '',
      '  bind-tenant.ts <conqr-tenant-urn> <workspace-id> [application-id] [--by <user-id>]',
      '  bind-tenant.ts --list',
      '  bind-tenant.ts --retire <conqr-tenant-urn> [application-id]',
      '',
      `application-id defaults to ${DEFAULT_APPLICATION}.`,
      'The workspace must already exist; this creates nothing but the binding.',
      '',
      '--by records which ConqrHub user decided this, and must be their user id. It is',
      'optional: an unattributed binding is honest, and a name in a column that holds',
      'user ids is not.',
    ].join('\n'),
  );
  process.exit(message ? 2 : 0);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') usage();

  if (!process.env.DATABASE_URL) usage('DATABASE_URL is not set');

  const db = new Kysely<any>({
    dialect: new PostgresJSDialect({
      postgres: postgres(normalizePostgresUrl(process.env.DATABASE_URL)),
    }),
    plugins: [new CamelCasePlugin()],
  });

  // The service carries every refusal that matters — workspace must exist, a tenant already bound
  // elsewhere is a conflict, a workspace already bound elsewhere is a conflict. Reusing it rather
  // than reimplementing the SQL is the point: a second copy of those rules would drift.
  const bindings = new TenantBindingService(db);

  try {
    if (args[0] === '--list') {
      // Through the service, not a query of its own. The version that queried directly read
      // snake_case columns from a camelCasing connection and printed "undefined → undefined"
      // for every binding — the same defect that made resolve() ignore bindings while
      // appearing to work, surviving in the one path no test looked at.
      const rows = await bindings.list();
      if (rows.length === 0) {
        console.log('no bindings');
        return;
      }
      for (const b of rows) {
        console.log(
          `${b.status.padEnd(8)} ${b.conqrTenantId} → ${b.workspaceId} (${b.applicationId})`,
        );
      }
      return;
    }

    if (args[0] === '--retire') {
      const tenant = args[1];
      if (!tenant) usage('--retire needs a tenant URN');
      if (!TENANT_URN.test(tenant)) usage(`${tenant} is not a conqr:tenant URN`);
      const application = args[2] ?? DEFAULT_APPLICATION;
      await bindings.retire(tenant, application);
      console.log(`retired the binding for ${tenant} (${application})`);
      return;
    }

    // `created_by` is a uuid referencing users.id, so it holds a ConqrHub user or nothing. It
    // used to be filled from USER/USERNAME, which is an operating-system account name — every
    // invocation died on "invalid input syntax for type uuid", so the command that exists because
    // nothing could create a binding could not create one either. Naming the operator is opt-in
    // now, and unattributed is the honest default rather than a name in a column of ids.
    const byIndex = args.indexOf('--by');
    const by = byIndex >= 0 ? args[byIndex + 1] : undefined;
    if (byIndex >= 0) {
      if (!by || !UUID.test(by)) usage('--by requires a ConqrHub user id');
      args.splice(byIndex, 2);
    }

    const [tenant, workspace, application = DEFAULT_APPLICATION] = args;
    if (!tenant || !workspace) usage('a tenant URN and a workspace id are both required');
    if (!TENANT_URN.test(tenant)) usage(`${tenant} is not a conqr:tenant URN`);
    if (!UUID.test(workspace)) usage(`${workspace} is not a workspace id`);

    const result = await bindings.bind({
      conqrTenantId: tenant,
      applicationId: application,
      workspaceId: workspace,
      ...(by ? { createdBy: by } : {}),
    });
    console.log(`bound ${result.conqrTenantId} → workspace ${result.workspaceId} (${result.applicationId})`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: Error) => {
  // ConflictException and NotFoundException both land here; their messages already say what to do.
  console.error(`error: ${error.message}`);
  process.exit(1);
});

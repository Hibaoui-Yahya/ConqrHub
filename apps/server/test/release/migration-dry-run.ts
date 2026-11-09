/**
 * Release migration dry run (Hub), for the 7 migrations the LTC→production
 * release adds on top of production (last: 20260919T100000-suite-delegation-identity).
 * NEVER point it at production: modes full/failinject/seed write. snapshot is
 * read-only; verify is read-only and compares with a snapshot taken earlier.
 *
 * Run from apps/server:  npx tsx test/release/migration-dry-run.ts <dbUrl> <mode> [snapshotFile]
 *   mode = full     : baseline(prod) -> seed -> fingerprint -> up -> checks -> down -> compare -> up
 *   mode = upgrade  : DB already at prod state (e.g. a Staging copy): fingerprint -> up -> checks
 *   mode = failinject: baseline -> make the LAST migration fail -> prove nothing was applied
 *   mode = seed     : baseline(prod) -> synthetic data (EMB_ROWS embeddings)
 *   mode = snapshot : (read-only) fingerprint every table + meeting ownership into snapshotFile
 *   mode = verify   : (read-only) after the APP applied the migrations, compare with snapshotFile
 */
import { createRequire } from "module";
import * as path from "path";
import { promises as fs } from "fs";

const req = createRequire(path.join(process.cwd(), "package.json"));
const { Kysely, Migrator, FileMigrationProvider, sql } = req("kysely");
const { PostgresJSDialect } = req("kysely-postgres-js");
const postgres = req("postgres");

const [, , url, mode = "full", snapFile = "migration-snapshot.json"] = process.argv;
const PROD_LAST = "20260919T100000-suite-delegation-identity";
const NEW = [
  "20261013T120000-ai-embeddings-lexical",
  "20261013T200000-meeting-processing-run",
  "20261014T090000-attachment-text-extractions",
  "20261016T100000-suite-token-families",
  "20261016T200000-invitation-expiry",
  "20261016T220000-meeting-insights",
  "20261102T120000-meeting-shares",
];
const migrationFolder = path.join(process.cwd(), "src/database/migrations");
const db = new Kysely({ dialect: new PostgresJSDialect({ postgres: postgres(url, { max: 4, onnotice: () => {} }) }) });
const migrator = new Migrator({ db, provider: new FileMigrationProvider({ fs, path, migrationFolder }) });

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};
const q = async (text: string) => (await sql.raw(text).execute(db)).rows as any[];

async function report(r: any, label: string) {
  if (r.error) {
    console.log(`${label}: ERROR`, r.error?.message ?? r.error);
  }
  for (const it of r.results ?? []) console.log(`  ${label} ${it.direction} ${it.migrationName} ${it.status}`);
  return r;
}

// ---------- generic seeding (fills NOT NULL columns without default) ----------
async function insertRow(table: string, overrides: Record<string, any>) {
  const cols = await q(`select column_name, data_type, udt_name, is_nullable, column_default, is_generated
      from information_schema.columns where table_schema='public' and table_name='${table}' order by ordinal_position`);
  const row: Record<string, any> = {};
  for (const c of cols) {
    if (c.column_name in overrides) { row[c.column_name] = overrides[c.column_name]; continue; }
    if (c.is_generated === "ALWAYS" || c.column_default !== null || c.is_nullable === "YES") continue;
    const t = c.udt_name as string;
    row[c.column_name] =
      t === "uuid" ? sql`gen_random_uuid()` :
      t.startsWith("int") || t === "numeric" || t.startsWith("float") ? 0 :
      t === "bool" ? false :
      t === "jsonb" || t === "json" ? sql`'{}'::jsonb` :
      t === "timestamptz" || t === "timestamp" ? sql`now()` :
      t === "_text" || t === "_varchar" ? sql`'{}'` :
      c.data_type === "USER-DEFINED" && t !== "vector" ? sql.raw(`(enum_range(null::${t}))[1]`) :
      t === "vector" ? sql.raw(`'[${Array.from({ length: 1024 }, (_, i) => ((i % 7) / 10).toFixed(1)).join(",")}]'::vector`) :
      `${table}-${c.column_name}`;
  }
  const res = await db.insertInto(table).values(row).returning("id").executeTakeFirst().catch(async (e: any) => {
    throw new Error(`insert ${table}: ${e.message}`);
  });
  return (res as any)?.id;
}

async function seed() {
  const ws1 = await insertRow("workspaces", { name: "Acme", hostname: "acme" });
  const ws2 = await insertRow("workspaces", { name: "Other", hostname: "other" });
  const users: string[] = [];
  for (let i = 0; i < 4; i++)
    users.push(await insertRow("users", { email: `u${i}@acme.test`, name: `User ${i}`, workspace_id: i < 3 ? ws1 : ws2, role: i === 0 ? "owner" : i === 1 ? "admin" : "member" }));
  const sessions: string[] = [];
  for (const u of users) sessions.push(await insertRow("user_sessions", { user_id: u, workspace_id: u === users[3] ? ws2 : ws1 }).catch((e) => { console.log("  (user_sessions seed skipped)", e.message); return null; }));
  const space1 = await insertRow("spaces", { name: "General", slug: "general", workspace_id: ws1, creator_id: users[0] });
  const groups = await insertRow("groups", { name: "Team", workspace_id: ws1, creator_id: users[0] });
  // Meetings created by different people, incl. another tenant
  const meetingIds: string[] = [];
  for (let i = 0; i < 40; i++) {
    const creator = users[i % 4];
    meetingIds.push(await insertRow("meetings", {
      workspace_id: creator === users[3] ? ws2 : ws1,
      user_id: creator, meeting_type: i % 5 === 0 ? "recruitment-interview" : "generic-meeting", status: "completed", transcript: `transcript ${i}`, settings: sql`'{"markers":[{"t":1}]}'::jsonb`,
      space_id: creator === users[3] ? null : space1,
      title: `Meeting ${i}`,
    }));
  }
  // Pending + accepted invitations
  for (let i = 0; i < 5; i++) await insertRow("workspace_invitations", { workspace_id: ws1, email: `inv${i}@acme.test`, invited_by_id: users[0], role: "member" });
  // Embeddings (size drives the generated-column rewrite)
  const N = Number(process.env.EMB_ROWS ?? 5000);
  const cols = await q(`select column_name from information_schema.columns where table_name='ai_embeddings'`);
  const vec = `'[${Array.from({ length: 1024 }, (_, i) => ((i % 13) / 13).toFixed(3)).join(",")}]'::vector`;
  const pageCol = cols.some((c) => c.column_name === "page_id");
  const t0 = Date.now();
  // Bulk insert via generate_series with a realistic ~1 KB chunk of French text
  const colNames = cols.map((c) => c.column_name);
  const required = await q(`select column_name, udt_name, data_type from information_schema.columns where table_name='ai_embeddings' and is_nullable='NO' and column_default is null and is_generated='NEVER'`);
  const exprs: Record<string, string> = {
    workspace_id: `'${ws1}'::uuid`, space_id: `'${space1}'::uuid`, embedding: vec, dim: '1024', model: `'mistral-embed'`,
    chunk_text: `'Réunion de suivi client numéro ' || g || ' : décisions, échéances, prochaines étapes et risques identifiés. ' || repeat('Le comité a validé le plan détaillé. ', 25)`,
  };
  const sel = required.map((c) => exprs[c.column_name] ?? (c.data_type === "USER-DEFINED" ? `(enum_range(null::${c.udt_name}))[1]` : c.udt_name === "uuid" ? "gen_random_uuid()" : c.udt_name.startsWith("int") ? "g" : c.udt_name === "jsonb" ? "'{}'::jsonb" : c.udt_name === "timestamptz" ? "now()" : `'x'`));
  await q(`insert into ai_embeddings (${required.map((c) => c.column_name).join(",")}) select ${sel.join(",")} from generate_series(1, ${N}) g`);
  console.log(`  seeded ${N} ai_embeddings rows in ${Date.now() - t0} ms (page_id col: ${pageCol}, cols: ${colNames.length})`);
  return { ws1, ws2, users, sessions, meetingIds, groups };
}

// ---------- fingerprints of all pre-existing data ----------
async function fingerprint(tables?: string[]) {
  const list = tables ?? (await q(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name not like 'kysely_%' order by 1`)).map((r) => r.table_name);
  const out: Record<string, { cols: string[]; count: number; hash: string }> = {};
  for (const t of list) {
    const cols = (await q(`select column_name from information_schema.columns where table_schema='public' and table_name='${t}' and is_generated='NEVER' order by ordinal_position`)).map((r) => r.column_name);
    out[t] = { cols, count: 0, hash: "" };
  }
  return out;
}
async function hashTables(fp: Record<string, { cols: string[]; count: number; hash: string }>) {
  const res: Record<string, { count: number; hash: string }> = {};
  for (const [t, { cols }] of Object.entries(fp)) {
    const rowExpr = `md5(row(${cols.map((c) => `"${c}"`).join(",")})::text)`;
    const [r] = await q(`select count(*)::int n, md5(coalesce(string_agg(h, '' order by h), '')) hash from (select ${rowExpr} h from "${t}") s`);
    res[t] = { count: r.n, hash: r.hash };
  }
  return res;
}
const schemaShape = async () =>
  (await q(`select table_name||'.'||column_name||':'||udt_name||':'||is_nullable||':'||coalesce(column_default,'') s from information_schema.columns where table_schema='public' and table_name not like 'kysely_%'
     union all select 'idx '||indexname||' '||indexdef from pg_indexes where schemaname='public'
     union all select 'trg '||tgname||' on '||tgrelid::regclass from pg_trigger where not tgisinternal
     union all select 'fn '||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
     union all select 'con '||conname||' '||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace
     order by 1`)).map((r) => r.s as string);
const diff = (a: string[], b: string[]) => ({ onlyA: a.filter((x) => !b.includes(x)), onlyB: b.filter((x) => !a.includes(x)) });

async function postUpChecks(seedInfo: any | null, before: Record<string, { count: number; hash: string }>, fp: any) {
  const after = await hashTables(fp);
  const changed = Object.keys(before).filter((t) => before[t].hash !== after[t].hash || before[t].count !== after[t].count);
  // workspace_invitations legitimately changes ONLY through the new expires_at column, which is not in fp cols
  ok(changed.length === 0, `all ${Object.keys(before).length} pre-existing tables: same row count and identical content on pre-existing columns${changed.length ? " — changed: " + changed.join(",") : ""}`);
  const [m] = await q(`select count(*)::int n, count(processing_run_id)::int r from meetings`);
  ok(m.r === 0, `meetings: ${m.n} rows, processing_run_id NULL on all (no run in flight)`);
  const [inv] = await q(`select count(*)::int n, count(*) filter (where expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute')::int ok from workspace_invitations`);
  ok(inv.n === inv.ok, `workspace_invitations: ${inv.n} pending get expires_at = now()+7 days (nobody cut off)`);
  const [e] = await q(`select count(*)::int n, count(tsv)::int t from ai_embeddings`);
  ok(e.n === e.t, `ai_embeddings: tsv generated for ${e.t}/${e.n} rows`);
  const [s] = await q(`select (select count(*) from meeting_shares)::int sh, (select count(*) from meeting_insights)::int ins, (select count(*) from suite_token_families)::int fam, (select count(*) from attachment_text_extractions)::int ate`);
  ok(s.sh === 0 && s.ins === 0 && s.fam === 0 && s.ate === 0, `new tables start empty (no grant is created by the migration: Strict Private starts from the creator only)`);
  if (seedInfo?.sessions?.[1]) {
    // Trigger I1: revoking a Hub session revokes its suite token family
    const fam = await insertRow("suite_token_families", { workspace_id: seedInfo.ws1, user_id: seedInfo.users[1], client_id: "conqrmeet", hub_session_id: seedInfo.sessions[1], current_jti: sql`gen_random_uuid()`, expires_at: sql`now() + interval '1 day'` });
    await q(`update user_sessions set revoked_at = now() where id = '${seedInfo.sessions[1]}'`);
    const [f] = await q(`select state, revoked_reason from suite_token_families where id='${fam}'`);
    ok(f.state === "revoked" && f.revoked_reason === "session_revoked", `trigger: revoking a Hub session revokes its ConqrMeet token family (${f.state}/${f.revoked_reason})`);
    const fam2 = await insertRow("suite_token_families", { workspace_id: seedInfo.ws1, user_id: seedInfo.users[2], client_id: "conqrmeet", current_jti: sql`gen_random_uuid()`, expires_at: sql`now() + interval '1 day'` });
    await q(`update users set deactivated_at = now() where id = '${seedInfo.users[2]}'`);
    const [f2] = await q(`select state, revoked_reason from suite_token_families where id='${fam2}'`);
    ok(f2.state === "revoked" && f2.revoked_reason === "user_disabled", `trigger: deactivating a user revokes their families (${f2.state}/${f2.revoked_reason})`);
    // Share constraints
    const bad = await q(`insert into meeting_shares (meeting_id, workspace_id) values ('${seedInfo.meetingIds[0]}', '${seedInfo.ws1}')`).then(() => "accepted", (e) => "rejected");
    ok(bad === "rejected", `meeting_shares: a grant with neither user nor group is rejected`);
    const badRole = await q(`insert into meeting_shares (meeting_id, workspace_id, user_id, role) values ('${seedInfo.meetingIds[0]}', '${seedInfo.ws1}', '${seedInfo.users[1]}', 'editor')`).then(() => "accepted", () => "rejected");
    ok(badRole === "rejected", `meeting_shares: only role 'viewer' exists (editor rejected)`);
    // undo the functional test rows so the down/up comparison is on seeded data
    await q(`delete from suite_token_families; delete from suite_session_events; update user_sessions set revoked_at = null where id = '${seedInfo.sessions[1]}'; update users set deactivated_at = null where id = '${seedInfo.users[2]}'`);
  }
}

async function main() {
  console.log(`== mode ${mode}`);
  if (mode === "snapshot") {
    const done = (await q(`select name from kysely_migration order by name`)).map((r) => r.name);
    const fp = await fingerprint();
    const hashes = await hashTables(fp);
    const [own] = await q(`select count(*)::int n, md5(string_agg(id::text||':'||coalesce(user_id::text,'')||':'||workspace_id::text, ',' order by id)) h from meetings`);
    await fs.writeFile(snapFile, JSON.stringify({ at: new Date().toISOString(), last: done[done.length - 1], fp, hashes, own, shape: await schemaShape() }));
    console.log(`snapshot: ${Object.keys(fp).length} tables, ${own.n} meetings, last migration ${done[done.length - 1]} -> ${snapFile}`);
  } else if (mode === "verify") {
    const snap = JSON.parse(await fs.readFile(snapFile, "utf8"));
    const done = (await q(`select name from kysely_migration order by name`)).map((r) => r.name);
    ok(snap.last === PROD_LAST, `snapshot was taken at the production level (${snap.last})`);
    ok(NEW.every((n) => done.includes(n)), `the application applied the 7 release migrations (now ${done.length}, last ${done[done.length - 1]})`);
    const [own] = await q(`select count(*)::int n, md5(string_agg(id::text||':'||coalesce(user_id::text,'')||':'||workspace_id::text, ',' order by id)) h from meetings`);
    ok(own.h === snap.own.h && own.n === snap.own.n, `meeting ownership unchanged (${own.n} meetings)`);
    // Rows written by people using the app since the snapshot are expected; compare tables the
    // migrations could have touched, and report (not fail) any other drift.
    const after = await hashTables(snap.fp);
    const changed = Object.keys(snap.hashes).filter((t) => snap.hashes[t].hash !== after[t].hash);
    const watched = ["meetings", "meeting_transcripts", "meeting_documents", "meeting_action_proposals", "ai_embeddings", "workspace_invitations", "users", "workspaces", "spaces", "pages", "attachments"];
    const bad = changed.filter((t) => watched.includes(t));
    ok(bad.length === 0, `tables the migrations touch keep identical pre-existing content (${watched.length} checked)${bad.length ? " — changed: " + bad.join(",") : ""}`);
    if (changed.length) console.log(`  note: activity since the snapshot changed ${changed.filter((t) => !watched.includes(t)).join(", ") || "nothing else"}`);
    await postUpChecks(null, after, snap.fp);
  } else if (mode === "seed") {
    await report(await migrator.migrateTo(PROD_LAST), "base");
    await seed();
  } else if (mode === "upgrade") {
    const done = (await q(`select name from kysely_migration order by name`)).map((r) => r.name);
    ok(done[done.length - 1] === PROD_LAST, `database is at the production migration level (${done.length} applied, last ${done[done.length - 1]})`);
    const fp = await fingerprint();
    const before = await hashTables(fp);
    const counts = Object.fromEntries(Object.entries(before).filter(([t]) => ["meetings", "users", "workspaces", "pages", "ai_embeddings", "workspace_invitations", "spaces", "attachments"].includes(t)).map(([t, v]) => [t, v.count]));
    console.log("  row counts:", JSON.stringify(counts));
    const [own] = await q(`select count(*)::int n, md5(string_agg(id::text||':'||coalesce(user_id::text,'')||':'||workspace_id::text, ',' order by id)) h from meetings`);
    const t0 = Date.now();
    await report(await migrator.migrateToLatest(), "up");
    console.log(`  upgrade took ${Date.now() - t0} ms`);
    const [own2] = await q(`select count(*)::int n, md5(string_agg(id::text||':'||coalesce(user_id::text,'')||':'||workspace_id::text, ',' order by id)) h from meetings`);
    ok(own.h === own2.h && own.n === own2.n, `meeting ownership unchanged: ${own2.n} meetings, same (id, creator, workspace) fingerprint`);
    await postUpChecks(null, before, fp);
  } else if (mode === "failinject") {
    await report(await migrator.migrateTo(PROD_LAST), "base");
    // A VIEW named meeting_shares makes "create table if not exists" skip and the index creation fail
    await q(`create view meeting_shares as select 1 as meeting_id, 1 as user_id, 1 as group_id`);
    const shape0 = await schemaShape();
    const r = await report(await migrator.migrateToLatest(), "up");
    ok(!!r.error, `injected failure in the last migration makes the upgrade fail`);
    const done = (await q(`select name from kysely_migration order by name`)).map((x) => x.name);
    ok(done[done.length - 1] === PROD_LAST, `no migration recorded as applied (still at ${done[done.length - 1]})`);
    const shape1 = await schemaShape();
    const d = diff(shape0, shape1);
    ok(d.onlyA.length === 0 && d.onlyB.length === 0, `schema identical to before: the 6 earlier migrations were rolled back with it (single transaction)`);
  } else {
    await report(await migrator.migrateTo(PROD_LAST), "base");
    const seedInfo = await seed();
    const fp = await fingerprint();
    const before = await hashTables(fp);
    const baseShape = await schemaShape();
    const [own] = await q(`select md5(string_agg(id::text||':'||user_id::text||':'||workspace_id::text, ',' order by id)) h from meetings`);
    const t0 = Date.now();
    const r = await report(await migrator.migrateToLatest(), "up");
    console.log(`  upgrade took ${Date.now() - t0} ms`);
    ok(!r.error && r.results.length === 7 && r.results.every((x: any) => x.status === "Success"), `7 migrations applied in order, all Success`);
    const [own2] = await q(`select md5(string_agg(id::text||':'||user_id::text||':'||workspace_id::text, ',' order by id)) h from meetings`);
    ok(own.h === own2.h, `meeting ownership (id, creator_id, workspace_id) unchanged`);
    await postUpChecks(seedInfo, before, fp);
    const upShape = await schemaShape();
    // Rollback: down 7 times
    for (let i = 0; i < 7; i++) await report(await migrator.migrateDown(), "down");
    const downShape = await schemaShape();
    const d = diff(baseShape, downShape);
    ok(d.onlyA.length === 0 && d.onlyB.length === 0, `after 7 x down the schema is identical to production's${d.onlyA.length + d.onlyB.length ? " " + JSON.stringify(d) : ""}`);
    const afterDown = await hashTables(fp);
    const changed = Object.keys(before).filter((t) => before[t].hash !== afterDown[t].hash);
    ok(changed.length === 0, `after down, all pre-existing data identical${changed.length ? " — changed: " + changed.join(",") : ""}`);
    const r2 = await report(await migrator.migrateToLatest(), "re-up");
    const reShape = await schemaShape();
    const d2 = diff(upShape, reShape);
    ok(!r2.error && d2.onlyA.length === 0 && d2.onlyB.length === 0, `re-applying after rollback gives the same schema (idempotent forward path)`);
  }
  await db.destroy();
  console.log(failures ? `\n${failures} FAILURE(S)` : `\nALL CHECKS PASSED`);
  process.exit(failures ? 1 : 0);
}
main().catch(async (e) => { console.error("FATAL", e); await db.destroy(); process.exit(2); });

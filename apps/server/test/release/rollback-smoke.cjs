/**
 * Smoke test of the ROLLBACK build (previous production code + the release's
 * migration files) running on a database the release already migrated.
 * NON-production only. Exercises the old code's main paths over the new
 * schema, including the new triggers (logout → user_sessions → token families).
 *
 * Usage (from apps/server): HUB=... E2E_PASSWORD=... E2E_EMAIL_DOMAIN=... node test/release/rollback-smoke.cjs
 */
const { HUB, E2E_PASSWORD: PW, E2E_EMAIL_DOMAIN: DOM } = process.env;
if (/app\.conqrhub\.com|ltc\.conqrhub\.com/.test(HUB ?? "")) { console.error("REFUSED"); process.exit(3); }
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails++; };
class Jar { constructor() { this.c = {}; } store(r) { for (const sc of r.headers.getSetCookie?.() ?? []) { const [kv] = sc.split(";"); const i = kv.indexOf("="); this.c[kv.slice(0, i)] = kv.slice(i + 1); } } h() { return Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join("; "); } }
async function call(jar, path, body, method = "POST") {
  const r = await fetch(HUB + path, { method, headers: { "content-type": "application/json", origin: HUB, cookie: jar.h() }, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
  jar.store(r); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, data: j?.data ?? j };
}
(async () => {
  const owner = new Jar();
  let r = await call(owner, "/api/auth/login", { email: `owner@${DOM}`, password: PW });
  ok(r.status === 200, `password sign-in (HTTP ${r.status})`);
  r = await call(owner, "/api/users/me", {});
  ok(r.status === 200, `current user (HTTP ${r.status})`);
  r = await call(owner, "/api/ai/meeting?limit=100", undefined, "GET");
  const items = r.data?.items ?? [];
  ok(r.status === 200 && items.length > 0, `meeting list reads the migrated table (${items.length} meetings, HTTP ${r.status})`);
  if (items[0]) { r = await call(owner, `/api/ai/meeting/${items[0].id}`, undefined, "GET"); ok(r.status === 200, `meeting detail (HTTP ${r.status})`); }
  r = await call(owner, "/api/spaces", { page: 1, limit: 10 });
  const space = (r.data?.items ?? [])[0];
  ok(r.status === 200 && !!space, `spaces (HTTP ${r.status})`);
  r = await call(owner, "/api/pages/create", { spaceId: space?.id, title: "Rollback smoke", format: "markdown", content: "## Ancienne version\n\nPage créée par le build de retour arrière." });
  const pageId = r.data?.id;
  ok((r.status === 200 || r.status === 201) && !!pageId, `create a page (HTTP ${r.status})`);
  r = await call(owner, "/api/pages/info", { pageId });
  ok(r.status === 200, `read it back (HTTP ${r.status})`);
  r = await call(owner, "/api/search", { query: "procédure" });
  ok(r.status === 200, `search (HTTP ${r.status})`);
  r = await call(owner, "/api/workspace/invites/create", { emails: [`rollback-${Date.now()}@${DOM}`], role: "member" });
  ok(r.status < 300, `create an invitation over the new expires_at column (HTTP ${r.status})`);
  r = await call(owner, "/api/workspace/invites", {});
  ok(r.status === 200, `list invitations (HTTP ${r.status})`);
  const tmp = new Jar();
  await call(tmp, "/api/auth/login", { email: `member4@${DOM}`, password: PW });
  r = await call(tmp, "/api/auth/logout", {});
  ok(r.status < 300, `sign-out fires the new user_sessions triggers without error (HTTP ${r.status})`);
  console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL ROLLBACK SMOKE CHECKS PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(2); });

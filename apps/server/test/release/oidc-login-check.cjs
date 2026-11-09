/**
 * OIDC sign-in check against a NON-production Hub configured with a TEST
 * identity provider (e.g. navikt/mock-oauth2-server in non-interactive mode,
 * returning a fixed subject and e-mail). Exercises the production sign-in path
 * (/api/auth/oidc/login → IdP → /api/auth/oidc/callback, PKCE, state, nonce)
 * through the release's session layer, then checks the subject link.
 *
 * Usage (from apps/server):
 *   HUB=https://<staging hub> EXPECT_EMAIL=member2@staging.example.test node test/release/oidc-login-check.cjs
 */
const { HUB, EXPECT_EMAIL } = process.env;
if (/app\.conqrhub\.com|ltc\.conqrhub\.com/.test(HUB ?? "")) { console.error("REFUSED: production/LTC Hub"); process.exit(3); }
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails++; };
const jars = {};
const jarFor = (u) => (jars[new URL(u).host] ??= {});
function store(u, res) { const j = jarFor(u); for (const sc of res.headers.getSetCookie?.() ?? []) { const [kv] = sc.split(";"); const i = kv.indexOf("="); j[kv.slice(0, i).trim()] = kv.slice(i + 1); } }
const cookie = (u) => Object.entries(jarFor(u)).map(([k, v]) => `${k}=${v}`).join("; ");
async function get(u) { const r = await fetch(u, { redirect: "manual", headers: { cookie: cookie(u) } }); store(u, r); return { status: r.status, location: r.headers.get("location") ? new URL(r.headers.get("location"), u).toString() : null, text: await r.text() }; }

(async () => {
  let r = await get(`${HUB}/api/auth/oidc/login`);
  ok(r.status === 302 && /code_challenge=/.test(r.location ?? "") && /state=/.test(r.location ?? "") && /nonce=/.test(r.location ?? ""), `login redirects to the IdP with PKCE, state and nonce (HTTP ${r.status})`);
  r = await get(r.location);
  ok(r.status === 302 && (r.location ?? "").startsWith(`${HUB}/api/auth/oidc/callback`), `the IdP returns to the Hub callback with a code (HTTP ${r.status})`);
  r = await get(r.location);
  const hasSession = !!jarFor(HUB).authToken;
  ok((r.status === 302 || r.status === 303) && hasSession && !/error|login\?/.test(r.location ?? ""), `callback signs the person in (HTTP ${r.status} → ${r.location ? new URL(r.location).pathname : "-"}, session cookie: ${hasSession})`);
  const me = await fetch(`${HUB}/api/users/me`, { method: "POST", headers: { cookie: cookie(HUB), "content-type": "application/json", origin: HUB }, body: "{}" });
  const body = await me.json().catch(() => ({}));
  const email = body?.data?.user?.email ?? body?.data?.email ?? body?.user?.email;
  ok(me.status === 200 && email === EXPECT_EMAIL, `the session is the expected account (HTTP ${me.status}, ${email ?? JSON.stringify(body).slice(0, 120)})`);
  // A forged callback (wrong state) must not sign anyone in.
  const before = jarFor(HUB).authToken;
  delete jarFor(HUB).authToken;
  r = await get(`${HUB}/api/auth/oidc/callback?code=forged&state=forged`);
  ok(!jarFor(HUB).authToken, `a forged callback (unknown state) creates no session (HTTP ${r.status})`);
  jarFor(HUB).authToken = before;
  console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL OIDC CHECKS PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(2); });

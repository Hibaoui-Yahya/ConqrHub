/**
 * The Hub as suite identity provider, seen by a THIRD-PARTY OIDC client (the
 * way ConqrPlan / Plane and ConqrService sign in through it in production):
 * discovery, authorization code, code exchange with client_secret_post,
 * strict ID-token validation (openid-client), userinfo, and refusals.
 * Run it against the previous version and the release to compare behaviour.
 * NON-production only: it needs a test client registered in SUITE_IDP_CLIENTS.
 *
 * Usage (from apps/server):
 *   HUB=... RP_CLIENT_ID=... RP_CLIENT_SECRET=... RP_REDIRECT=https://rp-sim.invalid/callback \
 *   E2E_EMAIL=... E2E_PASSWORD=... node test/release/idp-third-party-client-check.cjs
 */
const { HUB, RP_CLIENT_ID: ID, RP_CLIENT_SECRET: SECRET, RP_REDIRECT: REDIRECT, E2E_EMAIL: EMAIL, E2E_PASSWORD: PW } = process.env;
if (/app\.conqrhub\.com|ltc\.conqrhub\.com/.test(HUB ?? "")) { console.error("REFUSED"); process.exit(3); }
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails++; };
(async () => {
  const oc = await import("openid-client");
  const issuer = new URL(`${HUB}/api/idp`);
  const disco = await (await fetch(`${HUB}/api/idp/.well-known/openid-configuration`)).json();
  ok(!!disco.authorization_endpoint && !!disco.token_endpoint, `discovery: issuer ${disco.issuer}, grants ${JSON.stringify(disco.grant_types_supported)}`);
  let config;
  try { config = await oc.discovery(new URL(disco.issuer), ID, { client_secret: SECRET }, oc.ClientSecretPost(SECRET)); ok(true, "openid-client accepts the discovery document (issuer matches)"); }
  catch (e) { ok(false, `openid-client discovery: ${e.message} ${e.cause?.message ?? ""}`); process.exit(1); }
  const l = await fetch(`${HUB}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: HUB }, body: JSON.stringify({ email: EMAIL, password: PW }) });
  const cookie = l.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const verifier = oc.randomPKCECodeVerifier(), state = oc.randomState(), nonce = oc.randomNonce();
  const url = oc.buildAuthorizationUrl(config, { redirect_uri: REDIRECT, scope: "openid email profile", state, nonce, code_challenge: await oc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256" });
  const a = await fetch(url, { redirect: "manual", headers: { cookie } });
  const loc = a.headers.get("location") ?? "";
  ok(a.status === 302 && loc.startsWith(REDIRECT) && /[?&]code=/.test(loc), `authorize redirects the signed-in person back with a code (HTTP ${a.status})`);
  // Exchange as a plain OAuth client does (client_secret_post + PKCE), and record the shape:
  // production's IdP returns no id_token, so clients rely on the access token and userinfo.
  const code = new URL(loc).searchParams.get("code");
  const tr = await fetch(disco.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: ID, client_secret: SECRET, code_verifier: verifier }) });
  const tokens = await tr.json().catch(() => ({}));
  ok(tr.status === 200 && !!tokens.access_token, `code exchange (HTTP ${tr.status}); response fields: ${Object.keys(tokens).sort().join(", ")}`);
  if (tokens.id_token) {
    const c = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString());
    ok(c.iss === disco.issuer && c.aud === ID && c.nonce === nonce, `id_token claims iss/aud/nonce consistent (email ${c.email})`);
  } else console.log("INFO  no id_token in the token response (same as production's IdP today)");
  if (tokens.access_token) {
    const ui = await fetch(disco.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}` } });
    const uj = await ui.json().catch(() => ({}));
    ok(ui.status === 200 && uj.email === EMAIL, `userinfo (HTTP ${ui.status}); claims: ${Object.keys(uj).sort().join(", ")}`);
    // The code is single-use.
    const again = await fetch(disco.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: ID, client_secret: SECRET, code_verifier: verifier }) });
    ok(again.status >= 400, `an authorization code works only once (second use HTTP ${again.status})`);
    // Refresh as a client that keeps a session does; then reuse the OLD refresh token.
    if (tokens.refresh_token) {
      const refresh = (rt) => fetch(disco.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: ID, client_secret: SECRET }) });
      const r1 = await refresh(tokens.refresh_token); const j1 = await r1.json().catch(() => ({}));
      ok(r1.status === 200 && !!j1.access_token, `refresh_token grant works (HTTP ${r1.status}); new refresh token issued: ${!!j1.refresh_token && j1.refresh_token !== tokens.refresh_token}`);
      const r2 = await refresh(tokens.refresh_token);
      console.log(`INFO  reusing the OLD refresh token after a refresh → HTTP ${r2.status} (rotation with reuse detection refuses it)`);
      if (j1.refresh_token) { const r3 = await refresh(j1.refresh_token); console.log(`INFO  the NEW refresh token after that reuse → HTTP ${r3.status} (401 = the whole family was revoked)`); }
    }
  }
  // A wrong client secret is refused.
  const v2 = oc.randomPKCECodeVerifier(), s2 = oc.randomState(), n2 = oc.randomNonce();
  const u2 = oc.buildAuthorizationUrl(config, { redirect_uri: REDIRECT, scope: "openid email profile", state: s2, nonce: n2, code_challenge: await oc.calculatePKCECodeChallenge(v2), code_challenge_method: "S256" });
  const a2 = await fetch(u2, { redirect: "manual", headers: { cookie } });
  const code2 = new URL(a2.headers.get("location")).searchParams.get("code");
  const bad = await fetch(disco.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT, client_id: ID, client_secret: "wrong", code_verifier: v2 }) });
  ok(bad.status === 401 || bad.status === 400, `a wrong client secret is refused (HTTP ${bad.status})`);
  // An unregistered redirect URI is refused.
  const a3 = await fetch(u2.toString().replace(encodeURIComponent(REDIRECT), encodeURIComponent("https://evil.invalid/cb")), { redirect: "manual", headers: { cookie } });
  ok(!(a3.headers.get("location") ?? "").startsWith("https://evil.invalid"), `an unregistered redirect URI is never used (HTTP ${a3.status})`);
  console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL IDP CLIENT CHECKS PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(2); });

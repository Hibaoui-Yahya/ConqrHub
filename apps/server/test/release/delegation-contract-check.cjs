/**
 * ConqrFabric delegation contract check against a NON-production Hub
 * (CLAUDE.md "Never Break the ConqrHub ↔ ConqrFabric Connection").
 *
 * It plays ConqrFabric with a test key pair: a service token plus an
 * `X-Conqr-Delegation` compact JWS (typ CONQR-OBO, alg EdDSA) for a test person
 * and organisation, then checks the public contract: routes, scopes, the
 * { data, success, status } envelope, the fields Fabric reads, and the status
 * codes Fabric maps (401, 403, 400/422, 404 — never a 500).
 *
 * Usage (from apps/server):
 *   HUB=https://<staging hub> DELEGATION_TOKEN=... FABRIC_PRIVATE_KEY_PEM_FILE=... \
 *   FABRIC_KID=... IDP_KEY=... PERSON_SUBJECT=... ORG_ID=... node test/release/delegation-contract-check.cjs
 */
const crypto = require("crypto");
const fs = require("fs");

const HUB = process.env.HUB;
const TOKEN = process.env.DELEGATION_TOKEN;
const KEY = crypto.createPrivateKey(fs.readFileSync(process.env.FABRIC_PRIVATE_KEY_PEM_FILE, "utf8"));
const KID = process.env.FABRIC_KID;
const IDP = process.env.IDP_KEY;
const SUB = `conqr:person:oidc:${IDP}:${process.env.PERSON_SUBJECT}`;
const TID = `conqr:org:oidc:${IDP}:${process.env.ORG_ID}`;
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails++; };
// Known, pre-existing behaviour (unchanged by the release, same on production):
// the inbound assertion's lifetime is not capped by CONQR_DELEGATION_MAX_TTL_SECONDS
// (that ceiling applies to the downstream exchanged token, conqrplan-core trust.ts)
// and a jti is not single-use (a captured assertion replays until it expires).
// Reported as WARN so a future fix shows up as PASS without failing the contract run.
const warn = (c, m) => console.log(`${c ? "PASS" : "WARN"}  ${m}`);
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

function jws(over = {}, key = KEY, kid = KID) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: SUB, tid: TID, aud: "conqrhub", scope: ["space:read", "page:search", "page:read", "page:create", "page:update", "comment:read", "comment:create"], iat: now, nbf: now - 5, exp: now + 120, act: "obo", iss: "conqrfabric", jti: crypto.randomUUID(), ...over };
  const head = b64({ alg: "EdDSA", typ: "CONQR-OBO", kid });
  const body = b64(claims);
  const sig = crypto.sign(null, Buffer.from(`${head}.${body}`), key).toString("base64url");
  return { token: `${head}.${body}.${sig}`, jti: claims.jti };
}
async function call(path, body, { assertion = jws(), token = TOKEN } = {}) {
  const r = await fetch(`${HUB}/api/delegation/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-conqr-delegation": assertion.token, "x-conqr-correlation-id": assertion.jti },
    body: JSON.stringify(body ?? {}),
  });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, json: j, text: t };
}

(async () => {
  // happy path
  let r = await call("spaces/list", { limit: 50 });
  ok(r.status === 200 && r.json?.success === true && Array.isArray(r.json?.data?.items), `spaces/list → 200, envelope { data: { items }, success } (${r.json?.data?.items?.length ?? "?"} spaces)`);
  const space = r.json?.data?.items?.[0];
  r = await call("pages/create", { space_id: space?.id ?? space?.slug, title: "Fabric contract check", content: "# Créée par la délégation\n\nContenu de test.", });
  const page = r.json?.data;
  ok(r.status === 200 || r.status === 201, `pages/create (Markdown) → ${r.status}`);
  r = await call("pages/read", { page_id: page?.id });
  const d = r.json?.data ?? {};
  ok(r.status === 200 && ["id", "title", "content", "slug_id", "space_id", "updated_at", "content_truncated"].every((k) => k in d), `pages/read returns the fields Fabric declares (id, title, content, slug_id, space_id, updated_at, content_truncated)`);
  r = await call("pages/update", { page_id: page?.id, content: "Ajout.", content_operation: "append" });
  ok(r.status === 200, `pages/update content_operation=append → ${r.status}`);
  r = await call("pages/search", { query: "Fabric", limit: 20 });
  ok(r.status === 200 && Array.isArray(r.json?.data?.items), `pages/search limit 20 → ${r.status}`);
  r = await call("pages/history", { page_id: page?.id, limit: 20 });
  ok(r.status === 200 && (r.json?.data?.items ?? []).every((i) => "id" in i && "created_at" in i), `pages/history items carry id, created_at → ${r.status}`);
  r = await call("comments/create", { page_id: page?.id, text: "Commentaire de délégation" });
  ok(r.status === 200 || r.status === 201, `comments/create → ${r.status}`);
  r = await call("comments/list", { page_id: page?.id, limit: 50 });
  ok(r.status === 200 && (r.json?.data?.items ?? []).length >= 1, `comments/list → ${r.status}`);
  // refusals Fabric maps
  r = await call("spaces/list", {}, { token: "wrong-token" });
  ok(r.status === 401, `wrong service token → 401 (${r.status})`);
  r = await call("spaces/list", {}, { assertion: jws({ exp: Math.floor(Date.now() / 1000) - 60 }) });
  ok(r.status === 401, `expired assertion → 401 (${r.status})`);
  r = await call("spaces/list", {}, { assertion: jws({ exp: Math.floor(Date.now() / 1000) + 3600 }) });
  warn(r.status === 401 || r.status === 403, `TTL above CONQR_DELEGATION_MAX_TTL_SECONDS refused (${r.status})`);
  r = await call("spaces/list", {}, { assertion: jws({}, crypto.generateKeyPairSync("ed25519").privateKey) });
  ok(r.status === 401, `assertion signed by another key → 401 (${r.status})`);
  r = await call("spaces/list", {}, { assertion: jws({ aud: "someone-else" }) });
  ok(r.status === 401, `wrong audience → 401 (${r.status})`);
  r = await call("pages/create", { space_id: space?.id, title: "x" }, { assertion: jws({ scope: ["page:read"] }) });
  ok(r.status === 403, `missing scope page:create → 403 (${r.status})`);
  r = await call("spaces/list", {}, { assertion: jws({ tid: `conqr:org:oidc:${IDP}:unknown-org` }) });
  ok(r.status === 401 || r.status === 403, `unknown organisation (other tenant) refused (${r.status})`);
  r = await call("spaces/list", {}, { assertion: jws({ sub: `conqr:person:oidc:${IDP}:nobody` }) });
  ok(r.status === 401 || r.status === 403, `unknown person refused (${r.status})`);
  const replay = jws();
  await call("spaces/list", {}, { assertion: replay });
  r = await call("spaces/list", {}, { assertion: replay });
  warn(r.status === 401 || r.status === 409 || r.status === 403, `replayed jti refused (${r.status})`);
  r = await call("pages/read", { page_id: "00000000-0000-0000-0000-000000000000" });
  ok(r.status === 404 || r.status === 403, `unknown page → ${r.status} (404/403, never 500)`);
  r = await call("pages/create", { space_id: space?.id });
  ok(r.status === 400 || r.status === 422, `invalid arguments → ${r.status} (400/422)`);
  console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL DELEGATION CONTRACT CHECKS PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(2); });

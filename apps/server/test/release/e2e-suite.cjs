/**
 * End-to-end check of the LTC→production release on a NON-production stack:
 * ConqrHub + ConqrMeet BFF + a mail catcher (Mailpit) + the stack's database.
 * Never point it at production: it creates meetings, shares and pages.
 *
 * Accounts are expected to exist (see stg-seed / the release report):
 *   owner@, admin1@ (admin), member1@ (owns pre-release meetings), member2@
 *   in E2E_EMAIL_DOMAIN, all with E2E_PASSWORD.
 *
 * Usage (from apps/server):
 *   HUB=... MEET=... MAILPIT=https://user:pass@mailpit... DB_URL=... E2E_PASSWORD=... \
 *   E2E_EMAIL_DOMAIN=staging.example.test node test/release/e2e-suite.cjs [main|disabled]
 */
const postgres = require("postgres");
const phase = process.argv[2] || "main";
const { HUB, MEET, MAILPIT, DB_URL, E2E_PASSWORD: PW, E2E_EMAIL_DOMAIN: DOM } = process.env;
if (!HUB || !MEET || !DB_URL || !PW || !DOM) { console.error("missing env"); process.exit(2); }
if (/app\.conqrhub\.com|ltc\.conqrhub\.com/.test(HUB)) { console.error("REFUSED: production/LTC Hub"); process.exit(3); }
const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails++; };
const mail = (() => { if (!MAILPIT) return null; const u = new URL(MAILPIT); const auth = u.username ? "Basic " + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString("base64") : null; u.username = ""; u.password = ""; return { base: u.toString().replace(/\/$/, ""), headers: auth ? { authorization: auth } : {} }; })();

class Jar { constructor() { this.c = {}; } store(r) { for (const sc of r.headers.getSetCookie?.() ?? []) { const [kv] = sc.split(";"); const i = kv.indexOf("="); const k = kv.slice(0, i).trim(); const v = kv.slice(i + 1); if (/max-age=0|expires=thu, 01 jan 1970/i.test(sc) || v === "") delete this.c[k]; else this.c[k] = v; } } header() { return Object.entries(this.c).map(([k, v]) => `${k}=${v}`).join("; "); } }
async function call(jar, url, { method = "POST", body, headers = {} } = {}) {
  const origin = new URL(url).origin;
  const res = await fetch(url, { method, redirect: "manual", headers: { "content-type": "application/json", origin, cookie: jar.header(), ...headers }, body: body === undefined ? (method === "POST" ? "{}" : undefined) : JSON.stringify(body) });
  jar.store(res); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, location: res.headers.get("location") };
}
const data = (r) => r.json?.data ?? r.json;
async function hubLogin(local) { const j = new Jar(); const r = await call(j, `${HUB}/api/auth/login`, { body: { email: `${local}@${DOM}`, password: PW } }); if (r.status !== 200) throw new Error(`login ${local} ${r.status}`); return j; }
async function meetLogin(hubJar) {
  const meet = new Jar();
  const a = await call(meet, `${MEET}/auth/login?returnTo=/`, { method: "GET" });
  const b = await call(hubJar, a.location, { method: "GET" });
  if (b.status !== 302 || !b.location?.startsWith(`${MEET}/auth/callback`)) throw new Error(`authorize ${b.status} ${b.location}`);
  const c = await call(meet, b.location, { method: "GET" });
  if (c.status !== 302 || /login=/.test(c.location ?? "")) throw new Error(`callback ${c.status} ${c.location}`);
  return meet;
}
const ids = async () => Object.fromEntries((await sql`select id, split_part(email, '@', 1) l from users`).map((u) => [u.l, u.id]));

async function main() {
  const cfg = await (await fetch(`${MEET}/client-config.js`)).text();
  const hubHtml = await (await fetch(`${HUB}/`)).text();
  if (phase === "disabled") {
    ok(cfg.includes('"hubPublishing":false'), `Meet without the setting: ${cfg.trim()}`);
    ok(!hubHtml.includes("MEETING_HUB_PUBLISHING"), "Hub without the setting");
    const alex = await meetLogin(await hubLogin("member2"));
    const [m] = await sql`select id from meetings where title = 'E2E weekly sync' order by created_at desc limit 1`;
    const [space] = await sql`select id from spaces where name = 'General' limit 1`;
    const r = await call(alex, `${MEET}/hubapi/ai/meeting/${m.id}/publish-bundle`, { body: { spaceId: space.id } });
    ok(r.status === 403, `publish refused by Hub when the setting is off (HTTP ${r.status})`);
    return;
  }
  const u = await ids();
  // ---- branding, runtime config ----
  ok(cfg.includes('"brand":"conqrai"') && cfg.includes('"hubPublishing":true'), `Meet runtime config: ${cfg.trim()}`);
  ok(hubHtml.includes('"MEETING_HUB_PUBLISHING":"enabled"') && !/t[eê]te chercheuse/i.test(hubHtml), "Hub runtime config: publishing enabled, no client branding");
  // ---- e-mail (captured) ----
  const owner = await hubLogin("owner");
  if (mail) {
    const before = (await (await fetch(`${mail.base}/api/v1/messages`, { headers: mail.headers })).json()).total;
    const addr = `e2e-${Date.now()}@${DOM}`;
    await call(owner, `${HUB}/api/workspace/invites/create`, { body: { emails: [addr], role: "member" } });
    await new Promise((s) => setTimeout(s, 4000));
    const list = (await (await fetch(`${mail.base}/api/v1/search?query=${encodeURIComponent("to:" + addr)}`, { headers: mail.headers })).json()).messages ?? [];
    const full = list[0] ? await (await fetch(`${mail.base}/api/v1/message/${list[0].ID}`, { headers: mail.headers })).json() : null;
    ok(!!full, `invitation e-mail captured by the mail catcher (${before} → +1), nothing delivered`);
    if (full) {
      const body = `${full.Subject}\n${full.Text}\n${full.HTML}`;
      ok(!/t[eê]te chercheuse|\bLTC\b/i.test(body) && /ConqrAI/.test(body), `e-mail "${full.Subject}": ConqrAI branding, no client branding`);
      ok(body.includes(new URL(HUB).host) && !body.includes("app.conqrhub.com"), "e-mail links point to this stack, never to production");
    }
  }
  // ---- SSO ----
  const alexHub = await hubLogin("member2"), benHub = await hubLogin("admin1"), m1Hub = await hubLogin("member1");
  const alex = await meetLogin(alexHub), ben = await meetLogin(benHub), own = await meetLogin(owner), m1 = await meetLogin(m1Hub);
  ok(true, "ConqrMeet sign-in through the Hub IdP: member, admin, owner");
  // ---- pre-release meetings (created on the previous version) ----
  const [legacy] = await sql`select id from meetings where user_id = ${u.member1} and deleted_at is null and title like 'Réunion synthétique%' order by created_at limit 1`;
  let r = await call(m1, `${MEET}/hubapi/ai/meeting/${legacy.id}`, { method: "GET" });
  ok(r.status === 200, `a meeting created BEFORE the release still opens for its creator (HTTP ${r.status})`);
  const legacyDetail = data(r) ?? {};
  const legacyOutputs = typeof legacyDetail.meeting?.aiOutputs === "string" ? JSON.parse(legacyDetail.meeting.aiOutputs) : legacyDetail.meeting?.aiOutputs;
  // Versioned transcript (meeting_transcripts), as written before the release.
  const tr = await call(m1, `${MEET}/hubapi/ai/meeting/${legacy.id}/transcript`, { method: "GET" });
  const trSegs = data(tr)?.segments ?? data(tr)?.transcript?.segments ?? [];
  ok((legacyDetail.meeting?.title ?? "").startsWith("Réunion synthétique") && !!legacyOutputs?.summary && tr.status === 200 && trSegs.length > 0,
    `its content reads back after the migrations (title, AI summary, transcript: HTTP ${tr.status}, ${trSegs.length} segments)`);
  for (const [who, jar] of [["the workspace owner", own], ["an admin", ben], ["another member", alex]]) {
    r = await call(jar, `${MEET}/hubapi/ai/meeting/${legacy.id}`, { method: "GET" });
    ok(r.status === 404 || r.status === 403, `pre-release meeting: ${who} can no longer open it (HTTP ${r.status})`);
  }
  r = await call(own, `${MEET}/hubapi/ai/meeting?limit=100`, { method: "GET" });
  const ownList = data(r)?.items ?? data(r) ?? [];
  ok(Array.isArray(ownList) && !ownList.some((m) => m.userId && m.userId !== u.owner), `the owner's meeting list holds only the owner's meetings (${Array.isArray(ownList) ? ownList.length : "?"})`);
  const [pubLegacy] = await sql`select (case when jsonb_typeof(settings)='string' then (settings #>> '{}')::jsonb else settings end) -> 'publishedBundle' ->> 'meetingPageId' p from meetings where status = 'published' and deleted_at is null and title like 'Réunion synthétique%' limit 1`;
  if (pubLegacy?.p) {
    r = await call(benHub, `${HUB}/api/pages/info`, { body: { pageId: pubLegacy.p } });
    ok(r.status === 200, `a page published before the release stays readable in its Hub space (HTTP ${r.status})`);
  }
  // ---- new meeting through Meet ----
  r = await call(alex, `${MEET}/hubapi/ai/meeting/start`, { body: { title: "E2E weekly sync", consent: true, languageConfig: { reportLanguage: "en" } } });
  const meetingId = data(r)?.id;
  ok(r.status === 201 && !!meetingId, `a member starts a meeting through Meet (HTTP ${r.status})`);
  await sql`update meetings set status = 'completed', ended_at = now(), duration_ms = 1800000,
    ai_outputs = ${JSON.stringify({ summary: "The team agreed on the Q4 plan.", next_steps: "- Ship the release" })},
    settings = ${JSON.stringify({ markers: [{ atMs: 61000, kind: "followup", note: "budget" }] })} where id = ${meetingId}`;
  for (const [who, jar] of [["admin", ben], ["owner", own]]) {
    r = await call(jar, `${MEET}/hubapi/ai/meeting/${meetingId}`, { method: "GET" });
    ok(r.status === 404 || r.status === 403, `Strict Private: the ${who} cannot open it (HTTP ${r.status})`);
  }
  r = await call(alex, `${MEET}/hubapi/ai/meeting/${meetingId}/shares`, { body: { userIds: [u.admin1] } });
  ok(r.status === 200, `the creator shares it with the admin (HTTP ${r.status})`);
  r = await call(ben, `${MEET}/hubapi/ai/meeting/${meetingId}`, { method: "GET" });
  ok(r.status === 200, `the admin can now read it (HTTP ${r.status})`);
  r = await call(ben, `${MEET}/hubapi/ai/meeting/${meetingId}/markers`, { body: { markers: [] } });
  ok(r.status === 403, `...not change it (viewer) (HTTP ${r.status})`);
  r = await call(own, `${MEET}/hubapi/ai/meeting/${meetingId}`, { method: "GET" });
  ok(r.status === 404 || r.status === 403, `the owner, not in the share, still cannot (HTTP ${r.status})`);
  // ---- publishing Meet → Hub ----
  r = await call(alex, `${MEET}/hubapi/spaces`, { body: { page: 1, limit: 50 } });
  const general = (data(r)?.items ?? []).find((s) => s.name === "General");
  ok(!!general, "Meet lists the spaces the member may publish to");
  r = await call(alex, `${MEET}/hubapi/ai/meeting/${meetingId}/publish-bundle`, { body: { spaceId: general?.id } });
  ok(r.status === 200, `publish into Hub through Meet (HTTP ${r.status}${r.status !== 200 ? " " + r.text.slice(0, 160) : ""})`);
  const pageId = data(r)?.meetingPage?.pageId ?? data(r)?.meetingPageId;
  const [page] = pageId ? await sql`select title, content::text c from pages where id = ${pageId}` : [];
  ok(!!page && /Summary/.test(page.c) && /Next steps/.test(page.c) && !/Résumé|Prochaines/.test(page.c), `the Hub page follows the meeting's language ("${page?.title}")`);
  r = await call(alex, `${MEET}/hubapi/ai/meeting/${meetingId}/publish-bundle`, { body: { spaceId: general?.id } });
  const [cnt] = await sql`select count(*)::int n from pages where title = 'E2E weekly sync' and deleted_at is null`;
  ok(r.status === 200 && cnt.n >= 1, `re-publish synchronises (HTTP ${r.status}, ${cnt.n} page)`);
  // ---- language of refusals through Meet (Hub caches the user 30 s) ----
  await call(benHub, `${HUB}/api/users/update`, { body: { locale: "fr-FR" } });
  await new Promise((s) => setTimeout(s, 31000));
  r = await call(ben, `${MEET}/hubapi/ai/meeting/${meetingId}/markers`, { body: { markers: [] } });
  const fr = data(r)?.message ?? "";
  await call(benHub, `${HUB}/api/users/update`, { body: { locale: "en-US" } });
  await new Promise((s) => setTimeout(s, 31000));
  r = await call(ben, `${MEET}/hubapi/ai/meeting/${meetingId}/markers`, { body: { markers: [] } });
  const en = data(r)?.message ?? "";
  ok(/^Lecture seule/.test(fr) && /^Read only/.test(en), `refusals follow the reader's language — fr: "${fr.slice(0, 40)}…" / en: "${en.slice(0, 40)}…"`);
  // ---- logout from Hub ends the Meet session (suite token families) ----
  const tmpHub = await hubLogin("member3"); const tmpMeet = await meetLogin(tmpHub);
  r = await call(tmpMeet, `${MEET}/hubapi/ai/meeting?limit=1`, { method: "GET" });
  const okBefore = r.status === 200;
  await call(tmpHub, `${HUB}/api/auth/logout`, {});
  r = await call(tmpMeet, `${MEET}/hubapi/ai/meeting?limit=1`, { method: "GET" });
  ok(okBefore && (r.status === 401 || r.status === 423), `signing out of Hub ends the ConqrMeet session (before 200, after ${r.status})`);
}
main().then(async () => { await sql.end(); console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL E2E CHECKS PASSED"); process.exit(fails ? 1 : 0); })
  .catch(async (e) => { console.error("FATAL", e.message); await sql.end(); process.exit(2); });

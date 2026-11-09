/**
 * Storage round trip on a NON-production Hub with the driver production uses
 * (local volume, STORAGE_DRIVER unset): upload a page attachment, read it
 * back byte for byte, refuse it to a signed-out caller.
 *
 * Usage (from apps/server): HUB=... E2E_PASSWORD=... E2E_EMAIL_DOMAIN=... node test/release/storage-roundtrip-check.cjs
 */
const crypto = require("crypto");
const { HUB, E2E_PASSWORD: PW, E2E_EMAIL_DOMAIN: DOM } = process.env;
if (/app\.conqrhub\.com|ltc\.conqrhub\.com/.test(HUB ?? "")) { console.error("REFUSED"); process.exit(3); }
let fails = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails++; };
(async () => {
  const l = await fetch(`${HUB}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: HUB }, body: JSON.stringify({ email: `owner@${DOM}`, password: PW }) });
  const cookie = l.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const sp = await (await fetch(`${HUB}/api/spaces`, { method: "POST", headers: { "content-type": "application/json", origin: HUB, cookie }, body: "{}" })).json();
  const spaceId = (sp.data?.items ?? [])[0]?.id;
  const pg = await (await fetch(`${HUB}/api/pages/create`, { method: "POST", headers: { "content-type": "application/json", origin: HUB, cookie }, body: JSON.stringify({ spaceId, title: "Storage round trip" }) })).json();
  const pageId = pg.data?.id;
  const bytes = crypto.randomBytes(200_000);
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  const form = new FormData();
  form.append("pageId", pageId);
  form.append("file", new Blob([bytes], { type: "application/pdf" }), "release-check.pdf");
  const up = await fetch(`${HUB}/api/files/upload`, { method: "POST", headers: { origin: HUB, cookie }, body: form });
  const upj = await up.json().catch(() => ({}));
  const att = upj.data ?? upj;
  ok(up.status === 200 || up.status === 201, `upload a 200 kB attachment (HTTP ${up.status})`);
  const url = `${HUB}/api/files/${att.id}/${encodeURIComponent(att.fileName ?? "release-check.pdf")}`;
  const down = await fetch(url, { headers: { cookie } });
  const got = Buffer.from(await down.arrayBuffer());
  ok(down.status === 200 && crypto.createHash("sha256").update(got).digest("hex") === sha, `read it back byte for byte from the volume (HTTP ${down.status}, ${got.length} bytes)`);
  const anon = await fetch(url);
  ok(anon.status === 401 || anon.status === 403 || anon.status === 404, `a signed-out caller cannot read it (HTTP ${anon.status})`);
  console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL STORAGE CHECKS PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(2); });

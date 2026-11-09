/**
 * Real AI check (Mistral) on a NON-production Hub with a DEDICATED, budget-capped
 * key and SYNTHETIC data only (a generated voice recording, invented text).
 * Never run it against production or with real meeting audio.
 *
 *  1. Text generation (/api/ai/generate): summarize, translate.
 *  2. Speech-to-text + meeting pipeline: upload a synthetic recording with
 *     autoProcess, wait for the transcript and the AI summary.
 * Reports UNVERIFIED (not PASS) when the stack has no AI configured (HTTP 503).
 *
 * Usage (from apps/server):
 *   HUB=... E2E_EMAIL=... E2E_PASSWORD=... AUDIO_FILE=synthetic-meeting.wav \
 *   node test/release/ai-capabilities-check.cjs
 */
const fs = require("fs");
const { HUB, E2E_EMAIL, E2E_PASSWORD, AUDIO_FILE } = process.env;
if (/app\.conqrhub\.com|ltc\.conqrhub\.com/.test(HUB ?? "")) { console.error("REFUSED"); process.exit(3); }
let fails = 0, unverified = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) fails++; };
const un = (m) => { console.log(`UNVERIFIED  ${m}`); unverified++; };
(async () => {
  const l = await fetch(`${HUB}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: HUB }, body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }) });
  const cookie = l.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const post = async (p, b) => { const r = await fetch(HUB + p, { method: "POST", headers: { "content-type": "application/json", origin: HUB, cookie }, body: JSON.stringify(b) }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
  // 1. text generation
  const text = "Réunion de suivi fictive : l'équipe a validé le calendrier du projet Atlas, le budget reste à confirmer, et Lina prépare la démonstration pour vendredi.";
  let r = await post("/api/ai/generate", { action: "summarize", content: text });
  if (r.status === 503) un("text generation: AI not configured on this stack (HTTP 503)");
  else ok(r.status < 300 && (r.j.data?.text ?? r.j.text ?? "").length > 20, `summarize (HTTP ${r.status}): "${String(r.j.data?.text ?? r.j.text ?? "").slice(0, 80)}…"`);
  r = await post("/api/ai/generate", { action: "translate", content: text, prompt: "English" });
  if (r.status === 503) un("translation: AI not configured (HTTP 503)");
  else ok(r.status < 300 && /calendar|budget|demo/i.test(r.j.data?.text ?? r.j.text ?? ""), `translate to English (HTTP ${r.status})`);
  // 2. STT + pipeline
  if (!AUDIO_FILE || !fs.existsSync(AUDIO_FILE)) { un("speech-to-text and meeting pipeline: no AUDIO_FILE given"); }
  else {
    const form = new FormData();
    form.append("consent", "true"); form.append("autoProcess", "true"); form.append("title", "Synthetic AI check");
    form.append("languageConfig", JSON.stringify({ reportLanguage: "fr" }));
    form.append("file", new Blob([fs.readFileSync(AUDIO_FILE)], { type: "audio/wav" }), "synthetic-meeting.wav");
    const up = await fetch(`${HUB}/api/ai/meeting/upload`, { method: "POST", headers: { origin: HUB, cookie }, body: form });
    const uj = await up.json().catch(() => ({})); const id = (uj.data ?? uj).id;
    if (!id) { ok(false, `upload (HTTP ${up.status}) ${JSON.stringify(uj).slice(0, 160)}`); }
    else {
      let status = "", detail = null;
      for (let i = 0; i < 90; i++) {
        const s = await fetch(`${HUB}/api/ai/meeting/${id}/status`, { headers: { cookie } }); const sj = await s.json().catch(() => ({}));
        status = (sj.data ?? sj).status ?? status;
        if (["awaiting_review", "speakers_pending_review", "completed", "published", "failed", "partially_failed"].includes(status)) break;
        await new Promise((res) => setTimeout(res, 5000));
      }
      if (status === "failed" || status === "partially_failed") {
        const d = await fetch(`${HUB}/api/ai/meeting/${id}`, { headers: { cookie } }); detail = (await d.json().catch(() => ({}))).data?.meeting?.failureReason;
        if (/not configured|503|AI_DRIVER|MISTRAL/i.test(detail ?? "")) un(`meeting pipeline: AI not configured (${detail})`);
        else ok(false, `meeting pipeline ended ${status}: ${detail}`);
      } else {
        const tr = await fetch(`${HUB}/api/ai/meeting/${id}/transcript`, { headers: { cookie } }); const tj = (await tr.json().catch(() => ({}))).data ?? {};
        const segs = tj.segments ?? tj.transcript?.segments ?? [];
        ok(segs.length > 0, `speech-to-text produced ${segs.length} transcript segments (status ${status})`);
        const m = await fetch(`${HUB}/api/ai/meeting/${id}`, { headers: { cookie } }); const mj = (await m.json().catch(() => ({}))).data?.meeting ?? {};
        const outputs = typeof mj.aiOutputs === "string" ? JSON.parse(mj.aiOutputs) : mj.aiOutputs ?? {};
        ok(!!outputs.summary || status === "speakers_pending_review", `AI summary ${outputs.summary ? "present" : "pending speaker review (expected for two voices)"}`);
      }
    }
  }
  console.log(`\n${fails} failure(s), ${unverified} unverified capability(ies)`);
  process.exit(fails ? 1 : unverified ? 4 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(2); });

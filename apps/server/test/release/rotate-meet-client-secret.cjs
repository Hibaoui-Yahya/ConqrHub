/**
 * Coordinated rotation of the ConqrMeet suite-IdP client secret.
 *
 * The Hub accepts one secret per client (a duplicate client id is refused), so
 * the Hub entry in SUITE_IDP_CLIENTS and ConqrMeet's MEET_CLIENT_SECRET must
 * change together. This script generates the new secret in memory, rewrites
 * only the `conqrmeet` entry (other clients and every redirect URI unchanged),
 * writes both variables with --skip-deploys (they take effect on each
 * service's next deployment), then re-reads them and checks they match.
 *
 * It never prints, logs or writes a secret: only entry counts, client ids,
 * redirect URIs and lengths. Dry run by default.
 *
 * Usage:
 *   node test/release/rotate-meet-client-secret.cjs --project <id> --env <name> \
 *     --hub-service ConqrHub --meet-service ConqrMeet [--client conqrmeet] [--apply]
 */
const { execFileSync } = require("child_process");
const crypto = require("crypto");

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const P = arg("project"), ENV = arg("env"), HUB = arg("hub-service", "ConqrHub"), MEET = arg("meet-service", "ConqrMeet");
const CLIENT = arg("client", "conqrmeet");
const APPLY = process.argv.includes("--apply");
if (!P || !ENV) { console.error("--project and --env are required"); process.exit(2); }

// On Windows the CLI is an npm .cmd shim, which needs a shell. Arguments are fixed names
// and ids; secrets only ever travel on stdin.
const rw = (args, input) => execFileSync("railway", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: process.platform === "win32" });
const vars = (svc) => JSON.parse(rw(["variable", "list", "-p", P, "-e", ENV, "-s", svc, "--json"]).replace(/^﻿/, ""));
const parse = (raw) => raw.split(";").map((e) => e.trim()).filter(Boolean).map((e) => { const [id, secret, ...rest] = e.split("|"); return { id, secret, redirect: rest.join("|") }; });
const describe = (entries) => entries.map((e) => `${e.id} (secret ${e.secret.length} chars) → ${e.redirect}`).join("\n    ");

const hubVars = vars(HUB);
const meetVars = vars(MEET);
const entries = parse(hubVars.SUITE_IDP_CLIENTS ?? "");
const target = entries.find((e) => e.id === CLIENT);
if (!target) { console.error(`no '${CLIENT}' entry in ${HUB}.SUITE_IDP_CLIENTS`); process.exit(3); }
if (!meetVars.MEET_CLIENT_SECRET) { console.error(`${MEET}.MEET_CLIENT_SECRET is not set`); process.exit(3); }
const consistentBefore = crypto.timingSafeEqual(Buffer.from(crypto.createHash("sha256").update(target.secret).digest()), Buffer.from(crypto.createHash("sha256").update(meetVars.MEET_CLIENT_SECRET).digest()));
console.log(`[${ENV}] ${HUB}.SUITE_IDP_CLIENTS: ${entries.length} client(s)\n    ${describe(entries)}`);
console.log(`[${ENV}] ${MEET}.MEET_CLIENT_SECRET matches the Hub entry today: ${consistentBefore}`);

const fresh = crypto.randomBytes(32).toString("hex");
const next = entries.map((e) => (e.id === CLIENT ? { ...e, secret: fresh } : e));
const nextRaw = next.map((e) => `${e.id}|${e.secret}|${e.redirect}`).join(";");
// Same shape: same ids, same redirects, only one secret changed.
const same = next.length === entries.length && next.every((e, i) => e.id === entries[i].id && e.redirect === entries[i].redirect && (e.id === CLIENT || e.secret === entries[i].secret));
if (!same) { console.error("refusing: the rewritten registry differs in more than the target secret"); process.exit(4); }
console.log(`new '${CLIENT}' secret: ${fresh.length} chars (not shown). Other clients and redirect URIs unchanged.`);

if (!APPLY) { console.log("dry run: nothing written. Re-run with --apply."); process.exit(0); }
rw(["variable", "set", "SUITE_IDP_CLIENTS", "--stdin", "--skip-deploys", "-p", P, "-e", ENV, "-s", HUB], nextRaw);
rw(["variable", "set", "MEET_CLIENT_SECRET", "--stdin", "--skip-deploys", "-p", P, "-e", ENV, "-s", MEET], fresh);
const hubAfter = parse(vars(HUB).SUITE_IDP_CLIENTS).find((e) => e.id === CLIENT);
const meetAfter = vars(MEET).MEET_CLIENT_SECRET;
const ok = hubAfter?.secret === fresh && meetAfter === fresh;
console.log(`written with --skip-deploys. Hub entry and Meet secret now match the new value: ${ok}`);
console.log("They take effect on each service's NEXT deployment: deploy the Hub, then ConqrMeet.");
process.exit(ok ? 0 : 5);

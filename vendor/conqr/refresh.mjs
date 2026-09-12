/**
 * Vendors the Conqr platform contract packages into this repository.
 *
 *   node vendor/conqr/refresh.mjs ../ConqrPlatform
 *
 * Why vendored tarballs rather than a registry or a copied source tree:
 *
 *   - **not a copy.** The single most dangerous thing an integration like this can do is
 *     re-implement the security contract — `checkContext`, the revision watermark key, the service
 *     assertion — in the consumer. Two implementations of a security check are two chances to
 *     disagree, and the disagreement is always discovered by an incident. These are the platform's
 *     own build artefacts, byte for byte;
 *   - **no registry.** There is no private npm registry in this phase, and adding a network
 *     dependency to the build to solve a packaging problem is not an improvement;
 *   - **pinned by content.** `PROVENANCE.json` records the platform commit and the SHA-256 of each
 *     tarball, so "which version of the contract is this product compiled against" has an exact
 *     answer, and drift is detectable rather than assumed absent.
 *
 * The one rewrite: `@conqr/sdk` declares `@conqr/contracts` as `workspace:*`, which means nothing
 * outside the platform's own workspace. It is rewritten to point at the contracts tarball sitting
 * beside it. Nothing else in either package is touched.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const here = resolve(import.meta.dirname);
const platform = resolve(process.argv[2] ?? "../ConqrPlatform");

const PACKAGES = [
  { dir: "packages/contracts", tarball: "conqr-contracts-0.1.0.tgz" },
  { dir: "packages/sdk-typescript", tarball: "conqr-sdk-0.1.0.tgz" },
];

// `shell: true` is needed on Windows only for pnpm, which is a .cmd wrapper. It must NOT be used
// for anything else here: with a shell, arguments are concatenated unquoted, and every path in this
// repository contains a space.
const run = (cmd, args, cwd, shell = false) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", shell });

/**
 * pnpm, with its arguments quoted.
 *
 * Learned the hard way: running pnpm through a shell concatenates the arguments without quoting,
 * so `--pack-destination C:\...\Coding Projects\...\vendor\conqr` splits at the space. pnpm then
 * writes the tarball to `C:\Users\<user>\Desktop\Coding`, creating that directory, and exits
 * successfully — so this script reported a clean vendoring while the tarballs it was supposed to
 * refresh sat untouched. The digests in PROVENANCE.json are what exposed it: they did not change
 * when the packages did.
 */
const pnpm = (args, cwd) =>
  run(
    "pnpm",
    process.platform === "win32" ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args,
    cwd,
    process.platform === "win32",
  );

console.log(`vendoring from ${platform}`);
const commit = run("git", ["rev-parse", "HEAD"], platform).trim();
const dirty = run("git", ["status", "--porcelain"], platform).trim();
if (dirty) {
  // A tarball built from an uncommitted tree cannot be traced back to anything.
  throw new Error(
    "the platform checkout has uncommitted changes; commit them first so the vendored " +
      "artefacts can be attributed to a commit",
  );
}

// The packages must be built, or `pnpm pack` ships an empty dist.
pnpm(["-r", "build"], platform);

for (const pkg of PACKAGES) {
  pnpm(["pack", "--pack-destination", here], join(platform, pkg.dir));
}

// Rewrite the SDK's workspace: dependency to the tarball beside it.
const work = mkdtempSync(join(tmpdir(), "conqr-vendor-"));
try {
  const sdk = join(here, "conqr-sdk-0.1.0.tgz");
  // --force-local: GNU tar reads a Windows path as host:path and tries to open an SSH connection.
  run("tar", ["--force-local", "-xzf", sdk, "-C", work]);
  const manifestPath = join(work, "package", "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  // @conqr/contracts becomes a PEER rather than a dependency.
  //
  // A `file:` path written inside a tarball is resolved relative to whatever installs it, not to
  // the tarball, so it cannot point at its sibling. A peer is also the honest relationship: the SDK
  // and the consumer must share ONE copy of the contract, or a TenantContext produced by one is a
  // structurally identical but nominally different type to the other, and — worse — two copies of
  // the watermark key builder could drift apart. The consumer declares the contracts tarball
  // itself, and that single instance satisfies this.
  if (manifest.dependencies?.["@conqr/contracts"]) {
    delete manifest.dependencies["@conqr/contracts"];
    manifest.peerDependencies = { ...manifest.peerDependencies, "@conqr/contracts": "0.1.0" };
    if (Object.keys(manifest.dependencies).length === 0) delete manifest.dependencies;
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const rebuilt = join(work, "rebuilt.tgz");
  run("tar", ["--force-local", "-czf", rebuilt, "-C", work, "package"]);
  rmSync(sdk, { force: true });
  renameSync(rebuilt, sdk);
} finally {
  rmSync(work, { recursive: true, force: true });
}

const provenance = {
  source: "https://github.com/Hibaoui-Yahya/ConqrPlatform",
  commit,
  vendored_at: new Date().toISOString(),
  note:
    "Built by vendor/conqr/refresh.mjs. @conqr/sdk's dependency on @conqr/contracts is moved to " +
    "peerDependencies so both share one instance; nothing else is modified.",
  artefacts: Object.fromEntries(
    PACKAGES.map((pkg) => [
      pkg.tarball,
      "sha256:" + createHash("sha256").update(readFileSync(join(here, pkg.tarball))).digest("hex"),
    ]),
  ),
};
writeFileSync(join(here, "PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
console.log(`vendored @ ${commit}`);
for (const [name, digest] of Object.entries(provenance.artefacts)) console.log(`  ${name}  ${digest}`);

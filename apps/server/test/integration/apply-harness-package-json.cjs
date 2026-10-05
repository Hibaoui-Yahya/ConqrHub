// Applies the two test-harness edits to apps/server/package.json when the integration harness is
// overlaid onto a branch that predates it: the Jest module mapper for absolute `src/` imports
// (pre-existing harness defect that stops auth suites from loading) and the integration script.
// Idempotent; touches nothing else.
const fs = require("node:fs");
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.scripts = pkg.scripts || {};
pkg.scripts["test:integration"] =
  pkg.scripts["test:integration"] || "jest --config test/integration/jest.config.json --runInBand --forceExit";
pkg.jest = pkg.jest || {};
pkg.jest.moduleNameMapper = pkg.jest.moduleNameMapper || {};
if (!pkg.jest.moduleNameMapper["^src/(.*)$"]) {
  pkg.jest.moduleNameMapper["^src/(.*)$"] = "<rootDir>/$1";
}
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
console.log("harness package.json edits applied to", file);

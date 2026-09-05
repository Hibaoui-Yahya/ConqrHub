#!/usr/bin/env node
/**
 * Compare a test run's failures against the known-failure register.
 *
 * The problem this solves: two suites in this repository fail on a clean
 * checkout of `main`. If CI simply fails on any red, it is red forever and
 * everyone learns to ignore it. If CI is told to ignore failures, it stops
 * being able to catch a regression. Neither is a working signal.
 *
 * So the build fails on failures that are NOT in the register, passes when
 * only registered ones fail, and — importantly — also complains when a
 * registered failure stops happening, because a stale register quietly grows
 * into a blanket exemption.
 *
 * Usage:
 *   npx jest ... --json --outputFile=results.json || true
 *   node .github/scripts/check-test-failures.mjs results.json [--full]
 *
 * `--full` says the run covered every suite the register mentions, which is
 * what makes "this entry never failed, delete it" a safe thing to say. Without
 * it a subset run would report most of the register as stale, which is noise.
 *
 * Exit codes: 0 = as expected, 1 = new failures.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const registerPath = resolve(here, '..', 'known-test-failures.txt');

const args = process.argv.slice(2);
const isFullRun = args.includes('--full');
const resultsPath = args.find((a) => !a.startsWith('--'));
if (!resultsPath) {
  console.error('usage: check-test-failures.mjs <jest-results.json>');
  process.exit(2);
}

const known = new Set(
  readFileSync(registerPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
);

let report;
try {
  report = JSON.parse(readFileSync(resultsPath, 'utf8'));
} catch (err) {
  console.error(`Could not read Jest results at ${resultsPath}: ${err.message}`);
  console.error('The run probably crashed before writing them; check the log above.');
  process.exit(2);
}

/** Jest's own separator for ancestor titles + test name. */
const nameOf = (t) => [...(t.ancestorTitles ?? []), t.title].join(' > ');

const failures = [];
for (const suite of report.testResults ?? []) {
  // A suite that fails to even load reports no assertions; that is always new,
  // never "known", because the register lists tests and not import errors.
  if (suite.testExecError || (suite.status === 'failed' && !suite.assertionResults?.length)) {
    failures.push({
      name: `${suite.name}: suite failed to run`,
      suite: suite.name,
      fatal: true,
    });
    continue;
  }
  for (const test of suite.assertionResults ?? []) {
    if (test.status === 'failed') {
      failures.push({ name: nameOf(test), suite: suite.name });
    }
  }
}

const unexpected = failures.filter((f) => !known.has(f.name));
const expected = failures.filter((f) => known.has(f.name));
// Only meaningful when the whole suite ran; see --full above.
const stale = isFullRun
  ? [...known].filter((k) => !failures.some((f) => f.name === k))
  : [];

const total = report.numTotalTests ?? 0;
const passed = report.numPassedTests ?? 0;
console.log(`\n${passed}/${total} passed, ${failures.length} failed\n`);

if (expected.length) {
  console.log(`Known failures, tolerated (${expected.length}):`);
  for (const f of expected) console.log(`  · ${f.name}`);
  console.log('');
}

if (stale.length) {
  console.log('::warning::Register lists failures that did not occur.');
  console.log(`These ${stale.length} entries look fixed — delete them from`);
  console.log('.github/known-test-failures.txt so the register keeps its teeth:');
  for (const s of stale) console.log(`  · ${s}`);
  console.log('');
}

if (unexpected.length) {
  console.log(`::error::${unexpected.length} test(s) failed that are not known failures.`);
  for (const f of unexpected) {
    console.log(`  ✗ ${f.name}`);
    console.log(`      ${f.suite}`);
  }
  console.log('');
  console.log('If one of these is genuinely pre-existing and out of scope, add it');
  console.log('to .github/known-test-failures.txt with a note explaining why —');
  console.log('but prefer fixing it.');
  process.exit(1);
}

// A stale register is a real problem, but not a reason to block a PR that
// probably fixed something. Warn loudly, stay green.
console.log('No unexpected failures.');
process.exit(0);

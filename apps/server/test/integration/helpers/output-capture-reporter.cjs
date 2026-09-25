// Captures everything Jest reports (including console output of test files) into a file so the
// CI "log leak scan" step can assert that no minted token appears in the run output.
const fs = require("node:fs");
const path = require("node:path");

class OutputCaptureReporter {
  constructor(globalConfig) {
    this.file = path.join(globalConfig.rootDir, "test", "integration", ".jest-output.log");
    fs.writeFileSync(this.file, "");
  }
  onTestResult(_test, result) {
    const lines = [];
    for (const c of result.console ?? []) lines.push(`[${c.type}] ${c.message}`);
    for (const r of result.testResults) lines.push(`${r.status} ${r.fullName}`);
    if (result.failureMessage) lines.push(result.failureMessage);
    fs.appendFileSync(this.file, lines.join("\n") + "\n");
  }
  onRunComplete() {}
}
module.exports = OutputCaptureReporter;

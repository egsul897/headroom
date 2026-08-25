/**
 * Runs `scripts/golden-test.ts <company>` as a child process, captures its
 * summary line, and compares it against the known current baseline -
 * failing the job only if the pass/fail/flagged/errored counts DIFFER from
 * that baseline, never merely because some rows are known-FAIL/flagged
 * (several Coherent/Matthews rows are expected, documented FAILs - see
 * docs/database-replay-safety.md and docs/founder-legal-review-2026-08-25.md).
 *
 * `scripts/golden-test.ts` itself sets a non-zero exit code whenever ANY row
 * fails, which is the current, expected, documented state for both
 * companies - calling it directly as a CI step would fail the job on
 * exactly the state we want to confirm is unchanged. This wrapper is what
 * actually gives the job a pass/fail signal tied to "did the counts change
 * from baseline," not "does everything pass."
 *
 * Baseline counts below were captured by running `npx tsx
 * scripts/golden-test.ts coherent` / `... matthews` against the real
 * sandbox database in this session (docs/database-replay-safety.md §13).
 */
import { spawnSync } from "child_process";

const BASELINES: Record<string, { passed: number; failed: number; flagged: number; errored: number; total: number }> = {
  coherent: { passed: 26, failed: 3, flagged: 1, errored: 0, total: 30 },
  matthews: { passed: 2, failed: 4, flagged: 10, errored: 2, total: 18 },
};

function parseSummary(output: string) {
  const m = output.match(/(\d+) passed, (\d+) failed, (\d+) flagged out-of-scope, (\d+) errored \((\d+) total\)/);
  if (!m) return null;
  return { passed: Number(m[1]), failed: Number(m[2]), flagged: Number(m[3]), errored: Number(m[4]), total: Number(m[5]) };
}

function main() {
  const company = process.argv[2];
  if (!company || !BASELINES[company]) {
    console.error(`Usage: tsx scripts/verify-golden-baseline.ts <coherent|matthews>`);
    process.exitCode = 1;
    return;
  }

  const result = spawnSync("npx", ["tsx", "scripts/golden-test.ts", company], { encoding: "utf8" });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  console.log(output);

  const actual = parseSummary(output);
  const baseline = BASELINES[company];

  if (!actual) {
    console.error(`Could not parse a summary line from scripts/golden-test.ts ${company} output - failing loudly rather than assuming success.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${company} baseline: ${JSON.stringify(baseline)}`);
  console.log(`${company} actual:   ${JSON.stringify(actual)}`);

  const matches = JSON.stringify(actual) === JSON.stringify(baseline);
  if (matches) {
    console.log(`\nOK: ${company} golden-harness counts match the established baseline.`);
    process.exitCode = 0;
  } else {
    console.error(`\nFAIL: ${company} golden-harness counts DIFFER from the established baseline - this is a real behavior change, investigate before merging/deploying.`);
    process.exitCode = 1;
  }
}

main();

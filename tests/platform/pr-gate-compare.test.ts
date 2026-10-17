import { describe, expect, it } from "vitest";
import { classifyFailure, compareRuns } from "../../scripts/platform/pr-gate-compare.mjs";
import { collectReport } from "../../scripts/platform/pr-gate-reporter.mjs";

function report(tests: { file: string; fullName: string; status: string; message?: string }[]) {
  const byFile = new Map<string, { name: string; status: string; assertionResults: unknown[] }>();
  for (const test of tests) {
    let file = byFile.get(test.file);
    if (!file) {
      file = { name: "/repo/" + test.file, status: "passed", assertionResults: [] };
      byFile.set(test.file, file);
    }
    file.assertionResults.push({
      fullName: test.fullName,
      status: test.status,
      failureMessages: test.message ? [test.message] : [],
    });
    if (test.status === "failed") file.status = "failed";
  }
  return { testResults: [...byFile.values()] };
}

describe("pr-gate compare", () => {
  it("a suite that failed to load on the base counts as fixed only when it loads on the PR and every test in it passes", () => {
    const base = { testResults: [{ name: "/repo/tests/b.test.ts", status: "failed", message: "ReferenceError: Cannot access 'x' before initialization", assertionResults: [] }] };
    const allPass = report([
      { file: "tests/b.test.ts", fullName: "one", status: "passed" },
      { file: "tests/b.test.ts", fullName: "two", status: "passed" },
    ]);
    const r1 = compareRuns(base, allPass);
    expect(r1.fail).toBe(false);
    expect(r1.fixed.map((f) => f.fullName)).toEqual(["<suite failed to load>"]);
    // loads but a test is skipped: still a hidden base failure
    const r2 = compareRuns(base, report([
      { file: "tests/b.test.ts", fullName: "one", status: "passed" },
      { file: "tests/b.test.ts", fullName: "two", status: "skipped" },
    ]));
    expect(r2.fail).toBe(true);
    expect(r2.suppressed).toHaveLength(1);
    // file deleted on the PR: hidden
    expect(compareRuns(base, report([{ file: "tests/other.test.ts", fullName: "x", status: "passed" }])).suppressed).toHaveLength(1);
  });

  it("does not fail the gate for a test that already fails on the base", () => {
    const base = report([{ file: "tests/a.test.ts", fullName: "suite keeps failing", status: "failed", message: "AssertionError: expected 1 to be 2" }]);
    const head = report([{ file: "tests/a.test.ts", fullName: "suite keeps failing", status: "failed", message: "AssertionError: expected 1 to be 2" }]);
    const result = compareRuns(base, head);
    expect(result.fail).toBe(false);
    expect(result.preExisting).toHaveLength(1);
    expect(result.regressions).toHaveLength(0);
    expect(result.preExisting[0]?.cause).toBe("assertion_regression");
  });

  it("fails when a test passes on the base and fails on the PR", () => {
    const base = report([{ file: "tests/a.test.ts", fullName: "suite was green", status: "passed" }]);
    const head = report([{ file: "tests/a.test.ts", fullName: "suite was green", status: "failed", message: "AssertionError: expected true to be false" }]);
    const result = compareRuns(base, head);
    expect(result.fail).toBe(true);
    expect(result.regressions.map((row) => row.fullName)).toEqual(["suite was green"]);
  });

  it("fails when a new test fails, and when a base failure is skipped or deleted", () => {
    const base = report([
      { file: "tests/a.test.ts", fullName: "still here", status: "failed", message: "AssertionError: no" },
      { file: "tests/a.test.ts", fullName: "will be skipped", status: "failed", message: "AssertionError: no" },
    ]);
    const head = report([
      { file: "tests/a.test.ts", fullName: "still here", status: "failed", message: "AssertionError: no" },
      { file: "tests/a.test.ts", fullName: "will be skipped", status: "skipped" },
      { file: "tests/b.test.ts", fullName: "brand new and red", status: "failed", message: "AssertionError: boom" },
    ]);
    const result = compareRuns(base, head);
    expect(result.fail).toBe(true);
    expect(result.regressions.map((row) => row.fullName)).toEqual(["brand new and red"]);
    expect(result.suppressed.map((row) => row.fullName)).toEqual(["will be skipped"]);
    expect(result.preExisting).toHaveLength(1);
  });

  it("records a base failure that passes on the PR as fixed", () => {
    const base = report([{ file: "tests/a.test.ts", fullName: "now fixed", status: "failed", message: "AssertionError: no" }]);
    const head = report([{ file: "tests/a.test.ts", fullName: "now fixed", status: "passed" }]);
    const result = compareRuns(base, head);
    expect(result.fail).toBe(false);
    expect(result.fixed.map((row) => row.fullName)).toEqual(["now fixed"]);
  });
});

describe("pr-gate failure causes", () => {
  it("classifies empty database url, outside-repo ENOENT, stale client, snapshot, and timeout", () => {
    expect(classifyFailure("PrismaClientInitializationError: DATABASE_URL resolved to an empty string")).toBe("needs_db_or_env");
    expect(classifyFailure("Error: ENOENT: no such file or directory, open '/tmp/claude-0/pilot/models.json'")).toBe("needs_db_or_env");
    expect(classifyFailure("Error: ENOENT: no such file or directory, open '/repo/tests/fixtures/missing.json'")).toBe("assertion_regression");
    expect(classifyFailure("@prisma/client did not initialize yet. Please run prisma generate")).toBe("stale_prisma_client");
    expect(classifyFailure("Snapshot `foo` mismatched")).toBe("snapshot_drift");
    expect(classifyFailure("Error: Test timed out in 5000ms.")).toBe("timeout");
    expect(classifyFailure("TypeError: Invalid URL\n    at parseAdminConnection (lib/testing/ephemeral-db.ts:35:15)\n    at new URL(baseDatabaseUrl)")).toBe("needs_db_or_env");
    expect(classifyFailure("AssertionError: expected 'blocked' to be 'clear'")).toBe("assertion_regression");
    expect(classifyFailure("")).toBe("unspecified");
  });

  it("keeps a beforeAll database error that skipped every test", () => {
    const skipped = { type: "test", name: "filters by date", result: { state: "skip" }, tasks: [] as unknown[] };
    const suite = {
      type: "suite",
      name: "amendment precedence",
      result: {
        state: "fail",
        errors: [{ message: "PrismaClientInitializationError: DATABASE_URL resolved to an empty string", stack: "at deleteFixture tests/versioning.test.ts:107" }],
      },
      tasks: [skipped],
    };
    Object.assign(skipped, { suite });
    const report = collectReport([
      {
        filepath: "/repo/tests/versioning.test.ts",
        name: "versioning.test.ts",
        result: { state: "fail" },
        tasks: [suite],
      },
    ]);
    const result = compareRuns(report, report);
    expect(result.fail).toBe(false);
    expect(result.preExisting.map((row) => row.cause)).toEqual(["needs_db_or_env"]);
    expect(result.preExisting[0]?.file).toBe("tests/versioning.test.ts");
  });
});

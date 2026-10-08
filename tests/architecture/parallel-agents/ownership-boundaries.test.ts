import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts/parallel-agents/check-ownership-boundaries.ts");

function runChecker(workstreamId: string, files: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(
    "npx",
    ["tsx", SCRIPT, "--workstream", workstreamId, "--files", ...files],
    { encoding: "utf8", cwd: process.cwd() },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("ownership boundary checker", () => {
  it("allows WS-PAR files inside exclusiveOwn", () => {
    const result = runChecker("WS-PAR", [
      "docs/architecture/parallel-agents/01-workstream-map.json",
      "tests/architecture/parallel-agents/workstream-map.test.ts",
      "scripts/parallel-agents/check-ownership-boundaries.ts",
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OK:");
  });

  it("rejects WS-PAR edits under peer exclusive production trees", () => {
    const result = runChecker("WS-PAR", ["lib/knowledge-factory/index.ts"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/mustNotTouch|not in exclusiveOwn/);
  });

  it("rejects WS-EHB in-place rewrite of the shared EDGAR connector", () => {
    const result = runChecker("WS-EHB", ["lib/connectors/edgar-connector.ts"]);
    expect(result.status).toBe(1);
  });

  it("allows WS-CKF docs under its exclusive tree", () => {
    const result = runChecker("WS-CKF", [
      "docs/knowledge-factory/README.md",
      "lib/knowledge-factory/index.ts",
    ]);
    expect(result.status).toBe(0);
  });
});

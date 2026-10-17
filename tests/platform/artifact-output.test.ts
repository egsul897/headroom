import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { artifactPath, artifactRoot, isTestRun, TEST_ARTIFACT_SUBDIR } from "@/lib/platform/artifact-output";
import { authorIndependentGroundTruth } from "../../scripts/covenant-dependency-atlas/author-independent-gt";

const ROOT = path.resolve(__dirname, "../..");
const sha = (p: string) => createHash("sha256").update(fs.readFileSync(p)).digest("hex");

describe("artifact output location", () => {
  it("writes into the repo only for an explicit non-test run", () => {
    expect(artifactPath("/repo", "docs/a/b.json", {})).toBe("/repo/docs/a/b.json");
  });
  it("redirects to a temp dir under any test runner", () => {
    const tmp = path.join(os.tmpdir(), TEST_ARTIFACT_SUBDIR);
    for (const env of [{ VITEST: "true" }, { VITEST_WORKER_ID: "1" }, { NODE_ENV: "test" }]) {
      expect(isTestRun(env)).toBe(true);
      expect(artifactPath("/repo", "docs/a/b.json", env)).toBe(path.join(tmp, "docs/a/b.json"));
    }
    expect(isTestRun(process.env)).toBe(true);
    expect(artifactRoot(ROOT).startsWith(ROOT)).toBe(false);
  });
  it("HEADROOM_ARTIFACT_DIR wins; blank is ignored", () => {
    expect(artifactPath("/repo", "x.json", { HEADROOM_ARTIFACT_DIR: "/out", VITEST: "true" })).toBe("/out/x.json");
    expect(artifactPath("/repo", "x.json", { HEADROOM_ARTIFACT_DIR: "  " })).toBe("/repo/x.json");
  });
  it("rejects absolute and escaping paths", () => {
    expect(() => artifactPath("/repo", "/etc/passwd", {})).toThrow();
    expect(() => artifactPath("/repo", "../outside.json", {})).toThrow();
  });
  it("regenerating the authored ground truth under vitest leaves the committed FROZEN copy byte-identical", () => {
    const committed = path.join(ROOT, "tests/fixtures/covenant-dependency-atlas/authored-edges/independent-ground-truth-phase3.json");
    const before = sha(committed);
    const result = authorIndependentGroundTruth();
    expect(path.resolve(result.path)).not.toBe(committed);
    expect(path.resolve(result.path).startsWith(ROOT + path.sep)).toBe(false);
    expect(sha(committed)).toBe(before);
  });
});

import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMMITTED_UNIT_DUMP_DIR, effectiveUnitDumpDir, unitDumpTarget } from "../../lib/covenant-learning-factory/process-package";

describe("unit dumps under a test runner go to the temp artifact dir", () => {
  const repo = process.cwd();
  it("an unset unitDumpDir under a test runner resolves outside the repo, for every cohort", () => {
    for (const env of [{ VITEST: "true" }, { VITEST_WORKER_ID: "1" }, { NODE_ENV: "test" }]) {
      const dir = effectiveUnitDumpDir(undefined, repo, env)!;
      expect(dir.startsWith(path.join(os.tmpdir()))).toBe(true);
      expect(dir.startsWith(repo + path.sep)).toBe(false);
      expect(dir.endsWith(COMMITTED_UNIT_DUMP_DIR)).toBe(true);
      // TRAIN_DEV would be allowed into the committed dir; under tests it still lands in temp.
      expect(unitDumpTarget({ packageKey: "chwy", cohort: "TRAIN_DEV" } as never, repo, dir)).toBe(path.join(dir, "chwy.units.json"));
    }
  });
  it("outside a test runner the default is unchanged (committed dir), and explicit values are honoured as given", () => {
    expect(effectiveUnitDumpDir(undefined, repo, {})).toBeUndefined();
    expect(effectiveUnitDumpDir(null, repo, { VITEST: "true" })).toBeNull();
    expect(effectiveUnitDumpDir("/tmp/x", repo, { VITEST: "true" })).toBe("/tmp/x");
    expect(effectiveUnitDumpDir(undefined, repo, { VITEST: "true", HEADROOM_ARTIFACT_DIR: "/tmp/art" })).toBe(path.join("/tmp/art", COMMITTED_UNIT_DUMP_DIR));
  });
});

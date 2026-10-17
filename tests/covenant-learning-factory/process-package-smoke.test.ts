import { describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { unitDumpTarget } from "../../lib/covenant-learning-factory/process-package";
import { artifactPath } from "../../lib/platform/artifact-output";
import { tmpdir } from "node:os";
import {
  getLearningPackage,
  processLearningPackage,
  LearningFileStore,
  defaultLearningStorePaths,
} from "../../lib/covenant-learning-factory";

describe("covenant learning factory — process package smoke", () => {
  it("processes MHK holdout through canonical compiler without auto-promotion", async () => {
    const spec = getLearningPackage("mhk-2026-credit-agreement");
    expect(spec).toBeTruthy();
    expect(spec!.cohort).toBe("HELD_OUT");

    const root = mkdtempSync(path.join(tmpdir(), "clf-"));
    const store = new LearningFileStore(defaultLearningStorePaths(root));
    // The committed HELD_OUT dump is frozen: snapshot it and prove the run never touches it.
    const committedDump = path.join(process.cwd(), "docs/covenant-learning-factory/unit-dumps/mhk-2026-credit-agreement.units.json");
    const frozen = existsSync(committedDump) ? readFileSync(committedDump) : null;
    const dumpDir = path.join(root, "unit-dumps");

    const { manifest } = await processLearningPackage({
      spec: spec!,
      store,
      skipIfUnchanged: false,
      persistNeon: false,
      unitDumpDir: dumpDir,
    });
    expect(existsSync(path.join(dumpDir, "mhk-2026-credit-agreement.units.json"))).toBe(true);

    expect(["OK", "ABSTAINED", "FAILED"]).toContain(manifest.status);
    expect(manifest.compilerVersion).toBe("offline-package-compile.v1");
    expect(manifest.claims.certified).toBe(false);
    expect(manifest.claims.autoPromotedLegalAuthority).toBe(false);
    expect(manifest.artifacts.every((a) => a.state === "PROPOSED" || a.state === "REVIEW_REQUIRED")).toBe(
      true,
    );
    expect(manifest.compileSummary).toBeTruthy();
    expect(manifest.evaluation?.independent).toBe(true);
    // Second run with same hashes should skip
    const second = await processLearningPackage({
      spec: spec!,
      store,
      skipIfUnchanged: true,
      persistNeon: false,
    });
    expect(second.manifest.status).toBe("SKIPPED_DUPLICATE");
    // A default-path run (no unitDumpDir) of the HELD_OUT package must not write the committed dump either.
    await processLearningPackage({ spec: spec!, store: new LearningFileStore(defaultLearningStorePaths(mkdtempSync(path.join(tmpdir(), "clf-")))), skipIfUnchanged: false, persistNeon: false });
    if (frozen) expect(Buffer.compare(readFileSync(committedDump), frozen)).toBe(0);
    // ...it goes to the test artifact dir instead (temp, outside the repo), so a test run leaves the tree clean.
    const tempDump = artifactPath(process.cwd(), "docs/covenant-learning-factory/unit-dumps/mhk-2026-credit-agreement.units.json");
    expect(tempDump.startsWith(process.cwd() + path.sep)).toBe(false);
    expect(existsSync(tempDump)).toBe(true);
  }, 180_000);

  it("unitDumpTarget refuses HELD_OUT/BLIND writes into the committed dump dir, by default or explicitly", () => {
    const repo = "/r";
    const held = { packageKey: "mhk", cohort: "HELD_OUT" } as const;
    expect(unitDumpTarget(held, repo)).toBeNull();
    expect(unitDumpTarget(held, repo, "/r/docs/covenant-learning-factory/unit-dumps")).toBeNull();
    expect(unitDumpTarget(held, repo, "/r/docs/covenant-learning-factory/unit-dumps/../unit-dumps/sub")).toBeNull();
    expect(unitDumpTarget({ packageKey: "x", cohort: "BLIND" } as never, repo)).toBeNull();
    expect(unitDumpTarget(held, repo, "/tmp/d")).toBe("/tmp/d/mhk.units.json");
    expect(unitDumpTarget(held, repo, null)).toBeNull();
    expect(unitDumpTarget({ packageKey: "chwy", cohort: "TRAIN_DEV" } as never, repo)).toBe("/r/docs/covenant-learning-factory/unit-dumps/chwy.units.json");
  });
});

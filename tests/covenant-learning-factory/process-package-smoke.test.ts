import { describe, expect, it } from "vitest";
import path from "node:path";
import { mkdtempSync } from "node:fs";
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

    const { manifest } = await processLearningPackage({
      spec: spec!,
      store,
      skipIfUnchanged: false,
      persistNeon: false,
    });

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
  }, 180_000);
});

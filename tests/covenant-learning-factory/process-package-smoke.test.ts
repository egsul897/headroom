import { describe, expect, it } from "vitest";
import path from "node:path";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { unitDumpTarget } from "../../lib/covenant-learning-factory/process-package";
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

  it("unitDumpTarget: symlinks cannot bypass it, cohort labels are normalized, packageKey traversal throws", () => {
    const repo = realpathSync(mkdtempSync(path.join(tmpdir(), "clf-repo-")));
    const committed = path.join(repo, "docs/covenant-learning-factory/unit-dumps");
    mkdirSync(committed, { recursive: true });
    const outside = realpathSync(mkdtempSync(path.join(tmpdir(), "clf-out-")));
    const held = { packageKey: "mhk", cohort: "HELD_OUT" } as never;
    // A symlinked directory pointing into the committed dir is refused.
    const link = path.join(outside, "link-to-dumps");
    symlinkSync(committed, link);
    expect(unitDumpTarget(held, repo, link)).toBeNull();
    // A symlinked repo path is resolved the same way.
    const repoLink = path.join(outside, "repo-link");
    symlinkSync(repo, repoLink);
    expect(unitDumpTarget(held, repo, path.join(repoLink, "docs/covenant-learning-factory/unit-dumps"))).toBeNull();
    // A dump file that is itself a symlink into the committed dir is refused.
    const fileDir = path.join(outside, "files");
    mkdirSync(fileDir);
    writeFileSync(path.join(committed, "mhk.units.json"), "{}\n");
    symlinkSync(path.join(committed, "mhk.units.json"), path.join(fileDir, "mhk.units.json"));
    expect(unitDumpTarget(held, repo, fileDir)).toBeNull();
    // A not-yet-existing subdirectory under a symlink is still resolved through its nearest existing ancestor.
    expect(unitDumpTarget(held, repo, path.join(link, "new", "deeper"))).toBeNull();
    // Cohort label variants (and unknown cohorts) are protected; TRAIN_DEV variants may write.
    for (const cohort of ["held_out", " Held-Out ", "HELD OUT", "heldout", "blind", " BLIND\n", "", "SOMETHING_NEW", undefined]) {
      expect(unitDumpTarget({ packageKey: "p", cohort } as never, repo)).toBeNull();
    }
    for (const cohort of ["TRAIN_DEV", "train-dev", " Train Dev "]) {
      expect(unitDumpTarget({ packageKey: "p", cohort } as never, repo)).toBe(path.join(committed, "p.units.json"));
    }
    // packageKey traversal or separators throw, for every cohort and directory.
    for (const packageKey of ["../x", "..", "a/../../b", "/etc/x", "a/b", "a\\b", ".hidden", "x..y", ""]) {
      expect(() => unitDumpTarget({ packageKey, cohort: "TRAIN_DEV" } as never, repo, outside)).toThrow(/unsafe packageKey/);
    }
    expect(unitDumpTarget(held, repo, outside)).toBe(path.join(outside, "mhk.units.json"));
  });
});

/**
 * Held-out isolation: CKG dataset packages must not be the classic tuning set,
 * and must declare no prompt / extraction-rule development use.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPackages } from "../../lib/evaluation/ckg-benchmark";

const TUNING_PACKAGE_MARKERS = ["fwrg", "lsb", "conmed", "dsgr", "chewy", "chwy", "riot"];

describe("CKG held-out isolation", () => {
  it("excludes classic tuning/regression packages from the held-out dataset registry", () => {
    const pkgs = loadPackages() as {
      packages: Array<{ packageId: string; usedForPromptTuning: boolean; usedForExtractionRuleDevelopment: boolean }>;
    };
    for (const p of pkgs.packages) {
      const id = p.packageId.toLowerCase();
      for (const marker of TUNING_PACKAGE_MARKERS) {
        expect(id.includes(marker), `${p.packageId} looks like tuning package ${marker}`).toBe(false);
      }
      expect(p.usedForPromptTuning).toBe(false);
      expect(p.usedForExtractionRuleDevelopment).toBe(false);
    }
  });

  it("keeps Knife River body unread (blind contamination guard)", () => {
    const pkgs = loadPackages() as { reservedBlind: { status: string } };
    expect(pkgs.reservedBlind.status).toBe("BLIND_BODY_UNREAD");
    // Gibraltar provenance must still declare blind body unread.
    const provPath = path.join(
      process.cwd(),
      "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/provenance.json",
    );
    const prov = JSON.parse(fs.readFileSync(provPath, "utf8")) as {
      knifeRiver: { designation: string; bodyOpened: boolean };
    };
    expect(prov.knifeRiver.designation).toBe("BLIND");
    expect(prov.knifeRiver.bodyOpened).toBe(false);
  });

  it("system-output fixtures are not labeled as verified ground truth", () => {
    const dir = path.join(
      process.cwd(),
      "tests/fixtures/covenant-knowledge-generalization/system-outputs",
    );
    for (const f of fs.readdirSync(dir)) {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      expect(raw.toLowerCase()).not.toMatch(/verified ground truth|authority"\s*:\s*"model/i);
      const json = JSON.parse(raw) as { derivation?: string };
      expect(json.derivation?.toLowerCase() ?? "").toMatch(/never ground truth|not.*ground truth|not corrected answers|evaluation only|adversarial/);
    }
  });
});
